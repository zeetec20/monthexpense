import { z } from "zod";

// Max length is runtime config (env.MAX_INPUT_LENGTH), so the schema is built
// per-request rather than as a static module-level export.
export const buildParseRequestSchema = (maxLength: number) => {
  return z.object({
    text: z
      .string()
      .min(1, "text must not be empty")
      .max(maxLength, `text exceeds max length of ${maxLength}`),
    // Optional hint from the client's own EN/ID toggle — same one
    // buildExpenseParseRequestSchema already has for the voice path.
    // Omitted entirely is fine; the model already handles EN/ID/mixed text
    // without it.
    language: z.enum(["en", "id"]).optional(),
  });
};
export type ParseRequest = z.infer<ReturnType<typeof buildParseRequestSchema>>;

// referenceDate is the caller's local "today" (YYYY-MM-DD) — needed so the
// model resolves relative dates ("today"/"kemarin") against the speaker's
// actual day, not the Worker's UTC day.
export const buildExpenseParseRequestSchema = (maxLength: number) => {
  return z.object({
    text: z
      .string()
      .min(1, "text must not be empty")
      .max(maxLength, `text exceeds max length of ${maxLength}`),
    referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "referenceDate must be YYYY-MM-DD"),
    // Optional hint from the client's own EN/ID toggle — same one that
    // already drives STT. Omitted entirely is fine; the model already
    // handles EN/ID/mixed transcripts without it.
    language: z.enum(["en", "id"]).optional(),
  });
};
export type ExpenseParseRequest = z.infer<ReturnType<typeof buildExpenseParseRequestSchema>>;

// maxAudioBytes is the *decoded* cap (env.MAX_AUDIO_BYTES); base64 text is
// ~4/3 that, rounded up — the controller's Content-Length precheck uses the
// same math, this is the authoritative check.
export const buildVoiceTranscribeRequestSchema = (maxAudioBytes: number) => {
  const maxBase64Length = Math.ceil(maxAudioBytes / 3) * 4;
  return z.object({
    audio: z
      .string()
      .min(1, "audio must not be empty")
      .max(maxBase64Length, "audio exceeds max allowed size"),
    language: z.enum(["en", "id"]).optional(),
  });
};
export type VoiceTranscribeRequest = z.infer<ReturnType<typeof buildVoiceTranscribeRequestSchema>>;
