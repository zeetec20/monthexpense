import { ReceiptSchema, type Receipt } from "../schemas/receipt";
import { normalizeOcrText, normalizeReceiptCandidate } from "../parser/normalize";
import { extractJson } from "../parser/extract-json";
import { summarizeZodError } from "../parser/repair";
import { buildSuggestedTitle } from "../parser/title";
import { checkArithmetic } from "../parser/validate";
import type { ReceiptModel } from "../ai/model";
import { invalidOutputError } from "../lib/errors";

/** Extract + normalize + validate one candidate. Never throws. */
const validate = (rawOutput: string): { receipt?: Receipt; errorSummary?: string } => {
  let candidate: unknown;
  try {
    candidate = extractJson(rawOutput);
  } catch (err) {
    return { errorSummary: err instanceof Error ? err.message : "invalid or unparseable JSON output" };
  }

  const result = ReceiptSchema.safeParse(normalizeReceiptCandidate(candidate));
  if (result.success) {
    const receipt = { ...result.data, suggested_title: buildSuggestedTitle(result.data) };
    receipt.metadata = { ...receipt.metadata, validation_warning: checkArithmetic(receipt) };
    return { receipt };
  }
  return { errorSummary: summarizeZodError(result.error) };
};

/**
 * Orchestrator: normalize -> AI parse -> extract JSON -> normalize fields ->
 * validate -> bounded repair loop -> Receipt. Composes every layer built in
 * parser/, ai/, schemas/. Model is injected (never reads env.AI directly) so
 * it's swappable in tests and local dev.
 */
export const parseReceipt = async (
  model: ReceiptModel,
  maxRepairAttempts: number,
  ocrText: string,
  language?: "en" | "id",
): Promise<Receipt> => {
  const normalizedText = normalizeOcrText(ocrText);

  let rawOutput = String(await model.parse(normalizedText, language));
  let { receipt, errorSummary } = validate(rawOutput);
  if (!receipt) {
    console.error(JSON.stringify({ msg: "parse attempt failed", attempt: 0, errorSummary, outputLength: rawOutput.length }));
  }

  let attempts = 0;
  while (!receipt && attempts < maxRepairAttempts) {
    attempts++;
    rawOutput = String(await model.repair(rawOutput, errorSummary!, language));
    ({ receipt, errorSummary } = validate(rawOutput));
    if (!receipt) {
      console.error(JSON.stringify({ msg: "parse attempt failed", attempt: attempts, errorSummary, outputLength: rawOutput.length }));
    }
  }

  if (!receipt) throw invalidOutputError("The receipt could not be parsed.");
  return receipt;
};
