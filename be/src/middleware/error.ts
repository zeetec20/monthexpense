import type { ErrorHandler } from "hono";
import { ZodError } from "zod";
import type { HonoEnv } from "../types/env";
import { ERROR_CODES, type ErrorCode } from "../lib/constants";
import { createError, isError, isInvalidOutputError } from "../lib/errors";
import { isJsonExtractionError } from "../parser/extract-json";
import { isAiTimeoutError, isAiUnavailableError } from "../ai/model";

/** Thrown by middleware/routes to produce a specific {error:{code,message}} response. */
export const httpError = (status: number, code: ErrorCode, message: string) => {
  return createError("HttpError", message, { status, code });
};

const classify = (err: unknown): { status: number; code: ErrorCode; message: string } => {
  if (isError(err, "HttpError")) {
    const { status, code } = err as Error & { status: number; code: ErrorCode };
    return { status, code, message: err.message };
  }
  if (err instanceof ZodError) {
    return { status: 400, code: ERROR_CODES.SCHEMA_VALIDATION_FAILED, message: "Request validation failed" };
  }
  if (isJsonExtractionError(err)) {
    return { status: 502, code: ERROR_CODES.INVALID_MODEL_OUTPUT, message: "The input could not be parsed." };
  }
  if (isInvalidOutputError(err)) {
    // err.message is already the caller-set, user-safe string (see
    // lib/errors.ts's invalidOutputError) — never raw model internals.
    return { status: 502, code: ERROR_CODES.INVALID_MODEL_OUTPUT, message: err.message };
  }
  if (isAiTimeoutError(err)) {
    return { status: 504, code: ERROR_CODES.AI_TIMEOUT, message: "The AI request timed out." };
  }
  if (isAiUnavailableError(err)) {
    return { status: 502, code: ERROR_CODES.AI_UNAVAILABLE, message: "The AI service is unavailable." };
  }
  return { status: 500, code: ERROR_CODES.INTERNAL_ERROR, message: "An unexpected error occurred." };
};

// Never logs full OCR text, receipt data, auth headers, or API keys — only
// metadata. Never returns model internals/prompts/stack traces to the client.
export const errorHandler: ErrorHandler<HonoEnv> = (err, c) => {
  const { status, code, message } = classify(err);
  const requestId = c.get("requestId");
  const startTime = c.get("startTime");

  console.log(
    JSON.stringify({
      request_id: requestId,
      route: c.req.path,
      status,
      latency_ms: startTime ? Date.now() - startTime : undefined,
      error_code: code,
    }),
  );

  return c.json({ error: { code, message } }, status as 400);
};
