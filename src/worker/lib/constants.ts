// Error codes per architecture spec section 12. Never expose model
// internals/prompts/stack traces/secrets in messages using these codes.
export const ERROR_CODES = {
  INVALID_REQUEST: "INVALID_REQUEST",
  UNAUTHORIZED: "UNAUTHORIZED",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  UNSUPPORTED_MEDIA_TYPE: "UNSUPPORTED_MEDIA_TYPE",
  AI_UNAVAILABLE: "AI_UNAVAILABLE",
  AI_TIMEOUT: "AI_TIMEOUT",
  INVALID_MODEL_OUTPUT: "INVALID_MODEL_OUTPUT",
  SCHEMA_VALIDATION_FAILED: "SCHEMA_VALIDATION_FAILED",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// Fallbacks only — real values come from wrangler.jsonc `vars` / secrets.
export const DEFAULTS = {
  MODEL_NAME: "@cf/meta/llama-3.1-8b-instruct",
  MAX_INPUT_LENGTH: 15000,
  // Decoded-bytes cap for POST /v1/voice/transcribe's `audio` field — a
  // short voice note (a few seconds of webm/opus) is well under 1MB; 3MB
  // leaves headroom without inviting a base64 flood.
  MAX_AUDIO_BYTES: 3_000_000,
  AI_TIMEOUT_MS: 15000,
  MAX_REPAIR_ATTEMPTS: 1,
  API_VERSION: "v1",
  SERVICE_VERSION: "1.0.0",
} as const;
