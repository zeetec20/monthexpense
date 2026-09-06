import { useState } from "react";
import { WifiOff, Ban } from "lucide-react";
import { ExpenseReviewModal } from "./ExpenseReviewModal";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useTextReceipt } from "@/hooks/useTextReceipt";
import { useEntryQuota } from "@/hooks/useEntryQuota";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { t, type Lang } from "@/i18n/translations";
import { receiptToExpenseInput, type ExpenseInput } from "@/features/expense/expense.schema";
import type { Wallet } from "@/features/wallet/wallet.schema";

// Same pill-toggle pattern/labels as VoiceEntry.tsx's LANGS — hints the
// parser at the text's language, same "language" field the backend already
// accepts for voice.
const PARSE_LANGS = [
  { code: "id", label: "ID" },
  { code: "en", label: "EN" },
] as const;
type ParseLang = (typeof PARSE_LANGS)[number]["code"];

/** Standalone "paste a receipt as text" entry flow, its own top-level tab
 * next to Scan/Voice/Manual (see App.tsx) — covers online order/chat
 * receipts a user can only copy as text (no photo, no speech). Same
 * downstream pipeline as Scanner/VoiceEntry: parse to a Receipt, run it
 * through receiptToExpenseInput, hand off to the shared ExpenseReviewModal.
 * `onSubmit` is App.tsx's addExpense(input, "manual") — no dedicated
 * source value, this is just another way to produce the same ExpenseInput. */
export function TextReceiptEntry({
  onSubmit,
  wallets,
  defaultWalletId,
  lang = "id",
}: {
  onSubmit: (input: ExpenseInput) => void;
  wallets: Wallet[];
  defaultWalletId: string;
  lang?: Lang;
}) {
  const [text, setText] = useState("");
  // Defaults to the app's own current UI language, same as VoiceEntry's
  // sttLang default following its own convention — here there's no fixed
  // "always Indonesian" product decision to override it with.
  const [parseLang, setParseLang] = useState<ParseLang>(lang);
  const { status, receipt, message, parse, reset } = useTextReceipt();
  const quota = useEntryQuota("text");
  const online = useOnlineStatus();

  if (!online) {
    return <EmptyState icon={WifiOff} message={t(lang, "offlineFeatureUnavailable")} />;
  }
  if (quota && quota.remaining <= 0) {
    return <EmptyState icon={Ban} message={t(lang, "textReceiptErrorQuotaExceeded")} />;
  }

  if (status === "success" && receipt) {
    return (
      <ExpenseReviewModal
        initial={receiptToExpenseInput(receipt, null, t(lang, "textReceiptFallbackTitle"))}
        imageUrl={null}
        validationWarning={receipt.metadata.validation_warning}
        wallets={wallets}
        defaultWalletId={defaultWalletId}
        lang={lang}
        onClose={() => {
          reset();
          setText("");
        }}
        onSave={(input) => {
          onSubmit(input);
          reset();
          setText("");
        }}
      />
    );
  }

  const busy = status === "parsing";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 p-1 rounded-2xl border bg-card border-line w-fit mx-auto">
        {PARSE_LANGS.map(({ code, label }) => (
          <button
            key={code}
            type="button"
            onClick={() => setParseLang(code)}
            aria-pressed={parseLang === code}
            className={
              "h-7 w-10 flex items-center justify-center rounded-xl text-xs font-bold transition-all " +
              (parseLang === code ? "bg-emerald-600 text-white shadow-sm" : "text-ink-faint hover:text-ink")
            }
          >
            {label}
          </button>
        ))}
      </div>
      {quota && (
        <p className="text-right text-[11px] text-ink-faint">
          {t(lang, "quotaRemaining", { remaining: quota.remaining, limit: quota.limit })}
        </p>
      )}
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t(lang, "textReceiptPlaceholder")}
        rows={8}
        disabled={busy}
      />
      {status === "error" && message && <p className="text-xs text-red-500">{t(lang, message)}</p>}
      <Button
        type="button"
        className="w-full"
        disabled={busy || !text.trim()}
        onClick={() => void parse(text, parseLang)}
      >
        {busy ? t(lang, "textReceiptParsing") : t(lang, "textReceiptCard")}
      </Button>
    </div>
  );
}
