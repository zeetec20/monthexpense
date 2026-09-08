import { RECEIPT_API_URL, RECEIPT_API_KEY } from "@/config/env";
import { sheetIdentityHeaders } from "@/features/sync/sheets-sync.api";
import { receiptResponseSchema } from "@/features/receipt/receipt.schema";
import { QuotaExceededError } from "@/features/receipt/receipt.api";

/**
 * Browser equivalent of receipt.api.ts's parseReceipt, for the voice-
 * transcript path. `language` is an optional hint from the toggle. Response
 * is the exact same Receipt shape parseReceipt returns — see BE's
 * ai/prompt.ts EXPENSE_SYSTEM_PROMPT for why — reusing receiptResponseSchema
 * here rather than a separate parallel schema.
 */
export const parseVoiceExpense = async (
  text: string,
  referenceDate: string,
  language?: "en" | "id",
) => {
  const response = await fetch(`${RECEIPT_API_URL}/v1/expenses/parse`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RECEIPT_API_KEY}`,
      ...sheetIdentityHeaders(),
    },
    body: JSON.stringify({ text, referenceDate, language }),
  });

  if (response.status === 429) {
    throw new QuotaExceededError(`Expense parser rate limited: ${response.status}`);
  }
  if (!response.ok) {
    throw new Error(`Expense parser failed: ${response.status}`);
  }

  const json: unknown = await response.json();

  return receiptResponseSchema.parse(json);
};
