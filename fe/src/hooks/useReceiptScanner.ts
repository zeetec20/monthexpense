import { useCallback, useState } from "react";
import { recognizeReceipt } from "@/features/ocr/ocr.client";
import { reconstructLayout } from "@/features/ocr/layout";
import { parseReceipt, QuotaExceededError } from "@/features/receipt/receipt.api";
import { preprocessReceiptImage } from "@/lib/image/preprocess";
import { OOM_FALLBACK_MAX_DIMENSION } from "@/lib/image/resize";
import { getQuota, recordQuota } from "@/lib/entry-quota";
import type { Receipt } from "@/features/receipt/receipt.schema";

// A translation key, not literal prose — this hook has no reactive access
// to the current app language, so it hands back a stable key and lets the
// caller (Scanner.tsx, which has `lang`) translate it.
type ScannerErrorKey = "scannerErrorUnclear" | "scannerErrorParseFailed" | "scannerErrorQuotaExceeded";

type ScannerState =
  | { status: "idle"; receipt: null; message?: undefined; detail?: undefined }
  | { status: "ocr"; receipt: null; message?: undefined; detail?: undefined }
  | { status: "parsing"; receipt: null; message?: undefined; detail?: undefined }
  | { status: "success"; receipt: Receipt; message?: undefined; detail?: undefined }
  // detail: the real underlying error's name+message, for diagnosing
  // silent-failure reports (e.g. Safari/iOS) — same shape as useVoiceExpense's
  // VoiceState.detail, which solved an identical "no error at all" mystery
  // earlier. Not shown as the primary message (PRD §23 — no raw technical
  // errors as the headline), just surfaced alongside it.
  | { status: "error"; receipt: null; message: ScannerErrorKey; detail?: string };

export type ScannerStatus = ScannerState["status"];

const IDLE: ScannerState = { status: "idle", receipt: null };

export function useReceiptScanner() {
  const [state, setState] = useState<ScannerState>(IDLE);

  const scan = useCallback(async (file: Blob) => {
    setState({ status: "ocr", receipt: null });
    // Finer-grained than the "ocr"/"parsing" status above — purely for the
    // detail string below, so a silent Safari/iOS failure report says
    // exactly which step it never got past.
    let phase: "preprocess" | "ocr" | "parsing" = "preprocess";

    // Preprocess (specifically cropToPaper's getImageData on the full,
    // undownscaled bitmap) and OCR inference are both real OOM sites —
    // wrapping just the OCR half left preprocess-stage OOMs with no
    // retry at all. One retryable helper covers both.
    async function runPipeline(maxDimension?: number) {
      const image = await preprocessReceiptImage(file, maxDimension);
      phase = "ocr";
      return recognizeReceipt(image);
    }

    try {
      let document;
      try {
        document = await runPipeline();
      } catch (error) {
        // Only a confirmed WASM OOM gets a retry — some devices (mainly
        // older/lower-memory iPhones) can't fit the full-resolution
        // buffer, but most can, so this only degrades quality for the
        // device that actually needs it instead of every device on the
        // platform (see resize.ts's MAX_DIMENSION comment).
        const isOom = error instanceof RangeError && /memory/i.test(error.message);
        if (!isOom) throw error;
        phase = "preprocess";
        document = await runPipeline(OOM_FALLBACK_MAX_DIMENSION);
      }

      if (!document.text.trim()) {
        setState({ status: "error", receipt: null, message: "scannerErrorUnclear", detail: "empty OCR text" });
        return;
      }

      phase = "parsing";
      setState({ status: "parsing", receipt: null });

      const response = await parseReceipt(reconstructLayout(document));

      recordQuota("scan", response.quota);
      setState({ status: "success", receipt: response.data });
    } catch (error) {
      // Log technical errors during development; never render them as the
      // headline (PRD §23) — `detail` below surfaces a short version
      // alongside the translated message instead, for diagnosing reports
      // where the failure otherwise looks totally silent.
      console.error("Receipt scan failed", error);
      const detail = `${phase}: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`;
      if (error instanceof QuotaExceededError) {
        // BE's error response carries no quota numbers — 0 remaining is
        // implied by getting blocked; keep whatever limit we last knew.
        recordQuota("scan", { remaining: 0, limit: getQuota("scan")?.limit ?? 20 });
        setState({ status: "error", receipt: null, message: "scannerErrorQuotaExceeded", detail });
        return;
      }
      const message: ScannerErrorKey = phase === "parsing" ? "scannerErrorParseFailed" : "scannerErrorUnclear";
      setState({ status: "error", receipt: null, message, detail });
    }
  }, []);

  const reset = useCallback(() => setState(IDLE), []);

  return { ...state, scan, reset };
}
