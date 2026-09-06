// Pure JSON extraction pipeline: raw LLM text -> parsed unknown object.
// Never returns model output directly to the caller without going through
// this + schema validation.

import { createError, isError } from "../lib/errors";

const jsonExtractionError = (message: string) => {
  return createError("JsonExtractionError", message);
};
export const isJsonExtractionError = (err: unknown): err is Error => {
  return isError(err, "JsonExtractionError");
};

/** Strip ```json ... ``` / ``` ... ``` markdown fences if present. */
const stripMarkdownFences = (raw: string): string => {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fenced ? fenced[1]! : raw;
};

/** Locate the outermost {...} object via brace-depth scan (handles nesting/trailing text). */
const locateJsonObject = (text: string): string => {
  const start = text.indexOf("{");
  if (start === -1) throw jsonExtractionError("No JSON object found in model output");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw jsonExtractionError("Unterminated JSON object in model output");
};

/** Full pipeline: strip fences -> locate object -> JSON.parse. */
export const extractJson = (raw: string): unknown => {
  const unfenced = stripMarkdownFences(raw);
  const objectText = locateJsonObject(unfenced);
  try {
    return JSON.parse(objectText);
  } catch (err) {
    throw jsonExtractionError(
      `Failed to parse extracted JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
};
