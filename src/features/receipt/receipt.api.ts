import { z } from "zod";
import { RECEIPT_API_KEY } from "@/config/env";
import { sheetIdentityHeaders } from "@/features/sync/sheets-sync.api";
import { client } from "@/lib/api-client";
import { receiptResponseSchema } from "./receipt.schema";

const quotaGroupSchema = z.object({ remaining: z.number(), limit: z.number() });
const quotaStatusResponseSchema = z.object({
  data: z.object({ scan: quotaGroupSchema, voice: quotaGroupSchema, text: quotaGroupSchema }),
});

/** Thrown instead of the generic Error below on a 429 — BE's identityQuota
 * middleware enforces the daily cap; this just lets callers show a specific "limit
 * reached" state instead of a generic parse-failure message. */
export class QuotaExceededError extends Error {}

export const parseReceipt = async (text: string) => {
  const response = await client.v1.receipts.parse.$post(
    { json: { text } },
    {
      headers: {
        Authorization: `Bearer ${RECEIPT_API_KEY}`,
        ...sheetIdentityHeaders(),
      },
    },
  );

  if (response.status === 429) {
    throw new QuotaExceededError(`Receipt parser rate limited: ${response.status}`);
  }
  if (!response.ok) {
    throw new Error(`Receipt parser failed: ${response.status}`);
  }

  const json: unknown = await response.json();
  return receiptResponseSchema.parse(json);
};

/** Same endpoint/response shape as parseReceipt — a pasted receipt/chat
 * text blob is just another source of the same `{ text }` input BE already
 * parses (see ManualEntryForm.tsx's paste mode). Tracked under its own
 * "text" daily quota bucket, separate from photo scans. `language` is an
 * optional hint from TextReceiptEntry's ID/EN toggle, same one Voice
 * already sends. */
export const parseReceiptText = async (text: string, language?: "en" | "id") => {
  const response = await client.v1.receipts["parse-text"].$post(
    { json: { text, language } },
    {
      headers: {
        Authorization: `Bearer ${RECEIPT_API_KEY}`,
        ...sheetIdentityHeaders(),
      },
    },
  );

  if (response.status === 429) {
    throw new QuotaExceededError(`Receipt parser rate limited: ${response.status}`);
  }
  if (!response.ok) {
    throw new Error(`Receipt parser failed: ${response.status}`);
  }

  const json: unknown = await response.json();
  return receiptResponseSchema.parse(json);
};

/** Read-only usage status, no unit spent (BE's identityCheck, not
 * identityQuota) — lets the FE show real remaining/limit numbers on load
 * instead of only after a first scan/voice/text call. Best-effort: callers
 * should catch and ignore failures, this is a nice-to-have prefetch. */
export const getQuotaStatus = async () => {
  const response = await client.v1.quota.$get(undefined, {
    headers: { Authorization: `Bearer ${RECEIPT_API_KEY}`, ...sheetIdentityHeaders() },
  });
  if (!response.ok) throw new Error(`Quota status failed: ${response.status}`);
  const json: unknown = await response.json();
  return quotaStatusResponseSchema.parse(json).data;
};
