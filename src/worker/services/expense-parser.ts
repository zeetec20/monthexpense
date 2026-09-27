import { ReceiptSchema, type Receipt } from "../schemas/receipt";
import { normalizeReceiptCandidate } from "../parser/normalize";
import { extractJson } from "../parser/extract-json";
import { summarizeZodError } from "../parser/repair";
import { buildSuggestedTitle } from "../parser/title";
import { checkArithmetic, checkVoiceCompleteness } from "../parser/validate";
import type { ExpenseModel } from "../ai/model";
import { invalidOutputError } from "../lib/errors";

/** Extract + normalize + validate one candidate. Never throws. */
const validate = (rawOutput: string): { expense?: Receipt; errorSummary?: string } => {
  let candidate: unknown;
  try {
    candidate = extractJson(rawOutput);
  } catch (err) {
    return {
      errorSummary: err instanceof Error ? err.message : "invalid or unparseable JSON output",
    };
  }

  const result = ReceiptSchema.safeParse(normalizeReceiptCandidate(candidate));
  if (result.success) {
    const expense = { ...result.data, suggested_title: buildSuggestedTitle(result.data) };
    // checkArithmetic only fires when there's enough independent data to
    // cross-check (rare for a short spoken transcript); checkVoiceCompleteness
    // covers the more common "nothing to compare against, but something's
    // still missing" case.
    expense.metadata = {
      ...expense.metadata,
      validation_warning: checkArithmetic(expense) ?? checkVoiceCompleteness(expense),
    };
    return { expense };
  }
  return { errorSummary: summarizeZodError(result.error) };
};

/**
 * Orchestrator: AI parse -> extract JSON -> normalize fields -> validate ->
 * bounded repair loop -> Receipt. Same shape/shared pipeline as
 * services/receipt-parser.ts (normalizeReceiptCandidate, buildSuggestedTitle,
 * checkArithmetic) — voice extracts the exact same structured shape, just
 * from a spoken transcript instead of OCR text (see ai/prompt.ts's
 * EXPENSE_SYSTEM_PROMPT), plus the voice-only checkVoiceCompleteness pass.
 */
export const parseExpenseVoice = async (
  model: ExpenseModel,
  maxRepairAttempts: number,
  transcript: string,
  referenceDate: string,
  language?: "en" | "id",
): Promise<Receipt> => {
  let rawOutput = String(await model.parse(transcript, referenceDate, language));
  let { expense, errorSummary } = validate(rawOutput);
  if (!expense) {
    console.error(
      JSON.stringify({
        msg: "parse attempt failed",
        attempt: 0,
        errorSummary,
        outputLength: rawOutput.length,
      }),
    );
  }

  let attempts = 0;
  while (!expense && attempts < maxRepairAttempts) {
    attempts++;
    rawOutput = String(await model.repair(rawOutput, errorSummary!, referenceDate, language));
    ({ expense, errorSummary } = validate(rawOutput));
    if (!expense) {
      console.error(
        JSON.stringify({
          msg: "parse attempt failed",
          attempt: attempts,
          errorSummary,
          outputLength: rawOutput.length,
        }),
      );
    }
  }

  if (!expense) throw invalidOutputError("The expense could not be parsed.");
  return expense;
};
