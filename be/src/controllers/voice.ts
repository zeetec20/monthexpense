import type { Context } from "hono";
import type { HonoEnv } from "../types/env";
import { buildVoiceTranscribeRequestSchema } from "../schemas/request";
import { createTranscribeModel } from "../ai/model";
import { httpError } from "../middleware/error";
import { ERROR_CODES } from "../lib/constants";

/** Raw audio-to-text (no expense parsing) — the CF Workers AI tier of the voice-entry hybrid, between native SpeechRecognition and the WASM fallback. */
export const postVoiceTranscribe = async (c: Context<HonoEnv>) => {
  const contentType = c.req.header("Content-Type");
  if (!contentType?.includes("application/json")) {
    throw httpError(
      415,
      ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
      "Content-Type must be application/json",
    );
  }

  // content-length can be absent/spoofed — this is a fast-path guard only;
  // the authoritative check is the char cap on the parsed `audio` field below.
  const contentLength = Number(c.req.header("Content-Length") ?? 0);
  const maxBytes = Math.ceil(c.env.MAX_AUDIO_BYTES / 3) * 4 * 1.1; // base64 + JSON envelope overhead
  if (contentLength > maxBytes) {
    throw httpError(
      413,
      ERROR_CODES.PAYLOAD_TOO_LARGE,
      "Request body exceeds the maximum allowed size",
    );
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw httpError(400, ERROR_CODES.INVALID_REQUEST, "Request body must be valid JSON");
  }

  const schema = buildVoiceTranscribeRequestSchema(c.env.MAX_AUDIO_BYTES);
  const parsed = schema.parse(body); // throws ZodError -> mapped by error middleware

  const model = createTranscribeModel(c.env);
  const text = await model.transcribe(parsed.audio, parsed.language);

  return c.json({ data: { text } });
};
