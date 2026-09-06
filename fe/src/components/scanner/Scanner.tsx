import { useEffect, useRef, useState } from "react";
import { WifiOff, Ban } from "lucide-react";
import { LiveCameraCapture } from "@/components/camera/LiveCameraCapture";
import { ScannerPreview } from "./ScannerPreview";
import { ScannerStatus } from "./ScannerStatus";
import { ExpenseReviewModal } from "@/components/expense/ExpenseReviewModal";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useReceiptScanner } from "@/hooks/useReceiptScanner";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useEntryQuota } from "@/hooks/useEntryQuota";
import { isHeic, convertHeicToJpeg } from "@/lib/image/heic";
import { saveImage } from "@/lib/image/image-store";
import { t, type Lang } from "@/i18n/translations";
import { receiptToExpenseInput, type ExpenseInput, type ExpenseSource } from "@/features/expense/expense.schema";
import type { Wallet } from "@/features/wallet/wallet.schema";

let hasScannedOnce = false;

export function Scanner({
  addExpense,
  wallets,
  defaultWalletId,
  active,
  lang = "id",
  onExpandChange,
  onSaved,
}: {
  addExpense: (input: ExpenseInput, source: ExpenseSource) => void;
  wallets: Wallet[];
  defaultWalletId: string;
  /** Passed straight through to LiveCameraCapture — see its prop doc. */
  active: boolean;
  lang?: Lang;
  onExpandChange?: (expanded: boolean) => void;
  /** Fires once the scanned expense is actually saved — App.tsx closes
   * the enclosing sheet, same as VoiceEntry/TextReceiptEntry's onSubmit.
   * Scanner's own handleReset only resets its *local* state (back to
   * camera-capture UI) — without this, nothing ever told the sheet to
   * close, so it stayed open showing the camera again after saving. */
  onSaved?: () => void;
}) {
  const { status, receipt, message, detail, scan, reset } = useReceiptScanner();
  const online = useOnlineStatus();
  const quota = useEntryQuota("scan");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const imageBlobRef = useRef<Blob | null>(null);
  const imageIdRef = useRef<string | null>(null);
  const firstRunRef = useRef(!hasScannedOnce);

  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  async function handleCapture(file: File) {
    firstRunRef.current = !hasScannedOnce;
    hasScannedOnce = true;
    // Convert HEIC once, up front — <img> can't decode it directly (only
    // Safari, inconsistently), and this same converted blob doubles as what
    // gets shown in the result modal and persisted on save.
    const displayable = isHeic(file) ? await convertHeicToJpeg(file) : file;
    imageBlobRef.current = displayable;
    imageIdRef.current = crypto.randomUUID();
    setImageUrl(URL.createObjectURL(displayable));
    void scan(file);
  }

  function handleReset() {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(null);
    imageBlobRef.current = null;
    imageIdRef.current = null;
    reset();
  }

  const isBusy = status === "ocr" || status === "parsing";

  if (!online) {
    return <EmptyState icon={WifiOff} message={t(lang, "offlineFeatureUnavailable")} />;
  }
  // FE-side gate mirroring BE's identityQuota — pre-empts a doomed request
  // once we already know today's count from a prior response, instead of
  // waiting for another 429.
  if (quota && quota.remaining <= 0) {
    return <EmptyState icon={Ban} message={t(lang, "scannerErrorQuotaExceeded")} />;
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Hidden entirely once a photo exists (shutter or "Choose photo"),
          not just collapsed — leaving it mounted meant its own collapse
          transition and the busy/result panel below both animated in at
          once, which read as a glitch. handleReset (retry, or closing the
          success review modal) clears imageUrl and brings it back. */}
      {!imageUrl && (
        <LiveCameraCapture onCapture={handleCapture} disabled={isBusy} active={active} lang={lang} onExpandChange={onExpandChange} />
      )}

      {/* Shown for both busy and error — only success (a separate
          early-return branch above) and idle skip it, so the captured
          photo/placeholder never just vanishes on failure. */}
      {imageUrl && (isBusy || status === "error") && (
        <div className="flex flex-col items-center gap-3">
          <ScannerPreview imageUrl={imageUrl} />
          {isBusy && <ScannerStatus status={status} firstRun={firstRunRef.current} lang={lang} />}
        </div>
      )}

      {status === "error" && (
        <div className="flex max-w-64 flex-col items-center gap-3 text-center">
          <p className="text-sm whitespace-pre-line text-[var(--color-ink-2)]">{message && t(lang, message)}</p>
          {detail && <p className="text-center text-[10px] font-mono text-ink-faint/70">{detail}</p>}
          <Button variant="outline" size="sm" onClick={handleReset}>
            {t(lang, "scannerTryAgain")}
          </Button>
        </div>
      )}

      {status === "success" && receipt && (
        <ExpenseReviewModal
          initial={receiptToExpenseInput(receipt)}
          imageUrl={imageUrl}
          validationWarning={receipt.metadata.validation_warning}
          wallets={wallets}
          defaultWalletId={defaultWalletId}
          lang={lang}
          onClose={handleReset}
          onSave={async (input) => {
            const blob = imageBlobRef.current;
            const imageId = imageIdRef.current;
            if (blob && imageId) await saveImage(imageId, blob);
            addExpense({ ...input, receiptImageId: blob ? imageId : null }, "scan");
            handleReset();
            onSaved?.();
          }}
        />
      )}
    </div>
  );
}
