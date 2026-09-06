import type { Context } from "hono";
import type { HonoEnv } from "../types/env";
import { buildExpenseParseRequestSchema } from "../schemas/request";
import { parseExpenseVoice } from "../services/expense-parser";
import { createExpenseModel } from "../ai/model";
import { httpError } from "../middleware/error";
import { ERROR_CODES } from "../lib/constants";

export const postExpensesParse = async (c: Context<HonoEnv>) => {
  const contentType = c.req.header("Content-Type");
  if (!contentType?.includes("application/json")) {
    throw httpError(415, ERROR_CODES.UNSUPPORTED_MEDIA_TYPE, "Content-Type must be application/json");
  }

  // content-length can be absent/spoofed — this is a fast-path guard only;
  // the authoritative check is the char cap on the parsed `text` field below.
  const contentLength = Number(c.req.header("Content-Length") ?? 0);
  const maxBytes = c.env.MAX_INPUT_LENGTH * 4; // generous UTF-8 upper bound
  if (contentLength > maxBytes) {
    throw httpError(413, ERROR_CODES.PAYLOAD_TOO_LARGE, "Request body exceeds the maximum allowed size");
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw httpError(400, ERROR_CODES.INVALID_REQUEST, "Request body must be valid JSON");
  }

  const schema = buildExpenseParseRequestSchema(c.env.MAX_INPUT_LENGTH);
  const parsed = schema.parse(body); // throws ZodError -> mapped by error middleware

  const model = createExpenseModel(c.env);
  const expense = await parseExpenseVoice(
    model,
    c.env.MAX_REPAIR_ATTEMPTS,
    parsed.text,
    parsed.referenceDate,
    parsed.language,
  );

  return c.json({ data: expense, quota: c.get("quota") });
};
