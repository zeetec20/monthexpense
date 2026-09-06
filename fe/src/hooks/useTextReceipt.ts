import { useCallback, useState } from "react";
import { parseReceiptText, QuotaExceededError } from "@/features/receipt/receipt.api";
import { getQuota, recordQuota } from "@/lib/entry-quota";
import type { Receipt } from "@/features/receipt/receipt.schema";

// Same discriminated-union/translation-key convention as
// useReceiptScanner.ts and useVoiceExpense.ts — this hook has no reactive
// `lang`, the caller (TextReceiptEntry.tsx) translates the key.
type TextReceiptErrorKey = "textReceiptErrorUnclear" | "textReceiptErrorParseFailed" | "textReceiptErrorQuotaExceeded";

type TextReceiptState =
  | { status: "idle"; receipt: null; message?: undefined }
  | { status: "parsing"; receipt: null; message?: undefined }
  | { status: "success"; receipt: Receipt; message?: undefined }
  | { status: "error"; receipt: null; message: TextReceiptErrorKey };

const IDLE: TextReceiptState = { status: "idle", receipt: null };

/** Same shape as useReceiptScanner, minus the OCR step — the pasted text
 * *is* the input, no image/recognition phase before the parse call. Backs
 * ManualEntryForm's "paste receipt text" mode. */
export function useTextReceipt() {
  const [state, setState] = useState<TextReceiptState>(IDLE);

  const parse = useCallback(async (text: string, language?: "en" | "id") => {
    if (!text.trim()) {
      setState({ status: "error", receipt: null, message: "textReceiptErrorUnclear" });
      return;
    }
    setState({ status: "parsing", receipt: null });
    try {
      const response = await parseReceiptText(text, language);
      recordQuota("text", response.quota);
      if (!response.data.total) {
        setState({ status: "error", receipt: null, message: "textReceiptErrorUnclear" });
        return;
      }
      setState({ status: "success", receipt: response.data });
    } catch (error) {
      console.error("Text receipt parse failed", error);
      if (error instanceof QuotaExceededError) {
        recordQuota("text", { remaining: 0, limit: getQuota("text")?.limit ?? 20 });
        setState({ status: "error", receipt: null, message: "textReceiptErrorQuotaExceeded" });
        return;
      }
      setState({ status: "error", receipt: null, message: "textReceiptErrorParseFailed" });
    }
  }, []);

  const reset = useCallback(() => setState(IDLE), []);

  return { ...state, parse, reset };
}
