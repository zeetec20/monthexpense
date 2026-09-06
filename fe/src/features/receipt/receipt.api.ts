import { z } from "zod";
import { RECEIPT_API_URL, RECEIPT_API_KEY } from "@/config/env";
import { sheetIdentityHeaders } from "@/features/sync/sheets-sync.api";
import { receiptResponseSchema } from "./receipt.schema";

const quotaGroupSchema = z.object({ remaining: z.number(), limit: z.number() });
const quotaStatusResponseSchema = z.object({
  data: z.object({ scan: quotaGroupSchema, voice: quotaGroupSchema, text: quotaGroupSchema }),
});

/** Thrown instead of the generic Error below on a 429 — BE's identityQuota
 * middleware (text-processing-slm/src/middleware/identity-quota.ts) already
 * enforces the daily cap; this just lets callers show a specific "limit
 * reached" state instead of a generic parse-failure message. */
export class QuotaExceededError extends Error {}

async function post(endpoint: string, text: string, language?: "en" | "id") {
  const response = await fetch(`${RECEIPT_API_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${RECEIPT_API_KEY}`,
      ...sheetIdentityHeaders(),
    },
    body: JSON.stringify({ text, language }),
  });

  if (response.status === 429) {
    throw new QuotaExceededError(`Receipt parser rate limited: ${response.status}`);
  }
  if (!response.ok) {
    throw new Error(`Receipt parser failed: ${response.status}`);
  }

  const json: unknown = await response.json();

  return receiptResponseSchema.parse(json);
}

export function parseReceipt(text: string) {
  return post("/v1/receipts/parse", text);
}

/** Same endpoint/response shape as parseReceipt — a pasted receipt/chat
 * text blob is just another source of the same `{ text }` input BE already
 * parses (see ManualEntryForm.tsx's paste mode). Tracked under its own
 * "text" daily quota bucket, separate from photo scans. `language` is an
 * optional hint from TextReceiptEntry's ID/EN toggle, same one Voice
 * already sends. */
export function parseReceiptText(text: string, language?: "en" | "id") {
  return post("/v1/receipts/parse-text", text, language);
}

/** Read-only usage status, no unit spent (BE's identityCheck, not
 * identityQuota) — lets the FE show real remaining/limit numbers on load
 * instead of only after a first scan/voice/text call. Best-effort: callers
 * should catch and ignore failures, this is a nice-to-have prefetch. */
export async function getQuotaStatus() {
  const response = await fetch(`${RECEIPT_API_URL}/v1/quota`, {
    headers: { Authorization: `Bearer ${RECEIPT_API_KEY}`, ...sheetIdentityHeaders() },
  });
  if (!response.ok) throw new Error(`Quota status failed: ${response.status}`);
  const json: unknown = await response.json();
  return quotaStatusResponseSchema.parse(json).data;
}
