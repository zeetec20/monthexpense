import type { ZodError } from "zod";

/**
 * Pure formatting helper for the repair path: turns a failed Zod validation
 * into a terse, model-readable summary. Does not call AI itself — the
 * ReceiptModel.repair() caller (services/receipt-parser.ts) uses this string
 * plus the raw output to build the actual repair prompt (ai/prompt.ts).
 * Kept short per spec: avoid unnecessarily large prompts.
 */
export const summarizeZodError = (error: ZodError, maxIssues = 5): string => {
  return error.issues
    .slice(0, maxIssues)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
};
