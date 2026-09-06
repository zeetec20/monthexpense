import {
  buildExtractionPrompt,
  buildRepairPrompt,
  RECEIPT_JSON_SCHEMA,
  buildExpenseExtractionPrompt,
  buildExpenseRepairPrompt,
  type ChatMessage,
} from "./prompt";
import { createFakeReceiptModel, createFakeExpenseModel, createFakeTranscribeModel } from "./fake-model";
import type { Env } from "../types/env";
import { createError, isError } from "../lib/errors";

/**
 * Single seam between application code and Cloudflare Workers AI. Both the
 * real adapter and any test/local-dev double implement this — swapping
 * models or running fully offline only ever touches an implementation of
 * this interface, never routes/services/index.ts.
 */
export interface ReceiptModel {
  parse(ocrText: string, language?: "en" | "id"): Promise<unknown>;
  repair(rawOutput: string, errorSummary: string, language?: "en" | "id"): Promise<unknown>;
}

/** Same seam as ReceiptModel, for the voice-transcript-to-expense path. `language` is an optional hint from the client's own toggle. */
export interface ExpenseModel {
  parse(transcript: string, referenceDate: string, language?: "en" | "id"): Promise<unknown>;
  repair(rawOutput: string, errorSummary: string, referenceDate: string, language?: "en" | "id"): Promise<unknown>;
}

/** Seam for the raw audio-to-text step (POST /v1/voice/transcribe) — no parse/repair loop, just STT. */
export interface TranscribeModel {
  transcribe(audioBase64: string, language?: "en" | "id"): Promise<string>;
}

const aiTimeoutError = () => {
  return createError("AiTimeoutError", "Workers AI call timed out");
};
export const isAiTimeoutError = (err: unknown): err is Error => {
  return isError(err, "AiTimeoutError");
};

const aiUnavailableError = (cause: unknown) => {
  return createError("AiUnavailableError", "Workers AI call failed", { cause });
};
export const isAiUnavailableError = (err: unknown): err is Error => {
  return isError(err, "AiUnavailableError");
};

/**
 * Shape of the text-generation output Workers AI chat models return.
 * `response` is usually a plain string, but some models (observed on
 * llama-3.1-8b-instruct-fast) auto-parse a JSON-shaped completion and return
 * it as an object instead — handled below.
 */
interface WorkersAiChatResponse {
  response?: string | object;
}

/**
 * Shared low-level call: send `messages` to Workers AI under JSON Mode
 * (`jsonSchema`), with a timeout race and uniform error mapping. Both
 * createWorkersAIReceiptModel and createWorkersAIExpenseModel are thin
 * prompt-building wrappers around this.
 */
const runWorkersAiJson = async (
  ai: Ai,
  modelName: string,
  timeoutMs: number,
  messages: ChatMessage[],
  jsonSchema: object,
): Promise<string> => {
  // env.AI.run() has no built-in timeout/AbortSignal. Promise.race only
  // stops the Worker from waiting — it does not cancel the in-flight
  // inference call on Cloudflare's backend. Acceptable for a stateless
  // Worker (no resource leak on our side), but timeouts don't save neurons.
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(aiTimeoutError()), timeoutMs);
  });

  let raw: WorkersAiChatResponse;
  try {
    raw = (await Promise.race([
      // Workers AI defaults max_tokens to 256 when unset — too low and
      // silently truncates mid-object.
      //
      // response_format constrains generation at the token level so the
      // model literally cannot emit syntactically invalid JSON (e.g. two
      // adjacent numbers with no separator) — the real fix for the
      // JSON.parse failures free-text prompting alone couldn't prevent.
      // https://developers.cloudflare.com/workers-ai/features/json-mode/
      ai.run(modelName as Parameters<Ai["run"]>[0], {
        messages,
        temperature: 0,
        max_tokens: 2048,
        response_format: { type: "json_schema", json_schema: jsonSchema },
      } as Parameters<Ai["run"]>[1]),
      timeout,
    ])) as WorkersAiChatResponse;
  } catch (err) {
    if (isAiTimeoutError(err)) throw err;
    // Client only ever sees the generic AI_UNAVAILABLE message (never model
    // internals) — this is the one place the real cause gets recorded.
    console.error(
      JSON.stringify({ msg: "Workers AI call failed", cause: err instanceof Error ? err.message : String(err) }),
    );
    throw aiUnavailableError(err);
  }

  if (typeof raw.response === "object") return JSON.stringify(raw.response);
  return raw.response ?? "";
};

const createWorkersAIReceiptModel = (ai: Ai, modelName: string, timeoutMs: number): ReceiptModel => {
  return {
    parse: (ocrText, language) =>
      runWorkersAiJson(ai, modelName, timeoutMs, buildExtractionPrompt(ocrText, language), RECEIPT_JSON_SCHEMA),
    repair: (rawOutput, errorSummary, language) =>
      runWorkersAiJson(
        ai,
        modelName,
        timeoutMs,
        buildRepairPrompt(rawOutput, errorSummary, language),
        RECEIPT_JSON_SCHEMA,
      ),
  };
};

// Shares RECEIPT_JSON_SCHEMA with createWorkersAIReceiptModel — voice now
// extracts the exact same structured shape, see ai/prompt.ts's
// EXPENSE_SYSTEM_PROMPT comment for why.
const createWorkersAIExpenseModel = (ai: Ai, modelName: string, timeoutMs: number): ExpenseModel => {
  return {
    parse: (transcript, referenceDate, language) =>
      runWorkersAiJson(
        ai,
        modelName,
        timeoutMs,
        buildExpenseExtractionPrompt(transcript, referenceDate, language),
        RECEIPT_JSON_SCHEMA,
      ),
    repair: (rawOutput, errorSummary, referenceDate, language) =>
      runWorkersAiJson(
        ai,
        modelName,
        timeoutMs,
        buildExpenseRepairPrompt(rawOutput, errorSummary, referenceDate, language),
        RECEIPT_JSON_SCHEMA,
      ),
  };
};

/**
 * Whisper's Workers AI output shape has no JSON-schema constraint to
 * validate against (it's free-text transcription, not structured
 * extraction) — just the timeout race + uniform error mapping that
 * runWorkersAiJson also does, trimmed down for a single string field.
 */
const createWorkersAITranscribeModel = (ai: Ai, timeoutMs: number): TranscribeModel => {
  return {
    transcribe: async (audioBase64, language) => {
      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(aiTimeoutError()), timeoutMs);
      });

      let raw: { text?: string };
      try {
        raw = (await Promise.race([
          ai.run("@cf/openai/whisper-large-v3-turbo", {
            audio: audioBase64,
            language,
            task: "transcribe",
            // Skips silent stretches instead of feeding them to the model —
            // the same class of hallucination-on-silence risk the WASM
            // fallback guards against client-side (audio-capture.ts's
            // MIN_SAMPLES), handled server-side here instead.
            vad_filter: true,
          }),
          timeout,
        ])) as { text?: string };
      } catch (err) {
        if (isAiTimeoutError(err)) throw err;
        console.error(
          JSON.stringify({ msg: "Workers AI call failed", cause: err instanceof Error ? err.message : String(err) }),
        );
        throw aiUnavailableError(err);
      }

      return raw.text ?? "";
    },
  };
};

/**
 * Env-flag switch: LOCAL_MOCK_AI=true (wrangler dev has no local Workers AI
 * simulation) uses the fake double; everything else (remote dev, deploy)
 * uses the real Workers AI adapter. Tests inject createFakeReceiptModel()'s
 * result directly instead of going through this factory.
 */
export const createReceiptModel = (env: Env): ReceiptModel => {
  if (env.__testReceiptModel) return env.__testReceiptModel;
  if (env.LOCAL_MOCK_AI) return createFakeReceiptModel();
  return createWorkersAIReceiptModel(env.AI, env.MODEL_NAME, env.AI_TIMEOUT_MS);
};

/** Same env-flag switch as createReceiptModel, for the expense path. */
export const createExpenseModel = (env: Env): ExpenseModel => {
  if (env.__testExpenseModel) return env.__testExpenseModel;
  if (env.LOCAL_MOCK_AI) return createFakeExpenseModel();
  return createWorkersAIExpenseModel(env.AI, env.MODEL_NAME, env.AI_TIMEOUT_MS);
};

/**
 * Same env-flag switch as createReceiptModel, for the voice-transcribe
 * path. Not model-name-configurable (unlike Receipt/Expense) — whisper-
 * large-v3-turbo is hardcoded in createWorkersAITranscribeModel since
 * there's no other STT model in the JSON-mode chat family to swap to.
 */
export const createTranscribeModel = (env: Env): TranscribeModel => {
  if (env.__testTranscribeModel) return env.__testTranscribeModel;
  if (env.LOCAL_MOCK_AI) return createFakeTranscribeModel();
  return createWorkersAITranscribeModel(env.AI, env.AI_TIMEOUT_MS);
};
