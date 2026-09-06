import type { ScannerStatus as Status } from "@/hooks/useReceiptScanner";
import { t, type Lang, type TKey } from "@/i18n/translations";

const LABEL_KEY: Partial<Record<Status, TKey>> = {
  ocr: "scannerReadingReceipt",
  parsing: "scannerParsingReceipt",
};

export function ScannerStatus({ status, firstRun, lang }: { status: Status; firstRun: boolean; lang: Lang }) {
  if (status !== "ocr" && status !== "parsing") return null;

  const key = status === "ocr" && firstRun ? "scannerLoadingEngine" : LABEL_KEY[status];

  return (
    <div className="flex items-center gap-3 text-sm text-[var(--color-ink-3)]">
      <span
        aria-hidden
        className="size-2 rounded-full bg-[var(--color-accent)] motion-safe:animate-pulse"
      />
      <span>{key && t(lang, key)}</span>
    </div>
  );
}
