import { useState } from "react";
import { Mic, Square, Loader2, WifiOff, Ban } from "lucide-react";
import { ExpenseReviewModal } from "./ExpenseReviewModal";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useVoiceExpense } from "@/hooks/useVoiceExpense";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useEntryQuota } from "@/hooks/useEntryQuota";
import { t, type Lang } from "@/i18n/translations";
import { receiptToExpenseInput, type ExpenseInput } from "@/features/expense/expense.schema";
import type { Wallet } from "@/features/wallet/wallet.schema";

const LANGS = [
  { code: "id-ID", label: "ID" },
  { code: "en-US", label: "EN" },
] as const;
type LangCode = (typeof LANGS)[number]["code"];

// Always Indonesian by default, regardless of browser locale — explicit
// product decision, not a detection bug.
const defaultLang = (): LangCode => "id-ID";

// Two per language so the hint doesn't look static/repetitive — one is
// picked at mount (below) and stays put for the component's lifetime.
const EXAMPLE_SENTENCES: Record<LangCode, string[]> = {
  "en-US": [
    'e.g. "Bought coffee, twenty thousand rupiah"',
    'e.g. "Paid for parking, five thousand rupiah"',
  ],
  "id-ID": ['misal: "Beli kopi, dua puluh ribu"', 'misal: "Bayar parkir, lima ribu"'],
};

/** Audio-only entry point — no typed fields here, "Add manually" (App.tsx) covers that. */
export const VoiceEntry = ({
  onSubmit,
  wallets,
  defaultWalletId,
  lang = "id",
}: {
  onSubmit: (input: ExpenseInput) => void;
  wallets: Wallet[];
  defaultWalletId: string;
  /** App UI language — distinct from `LangCode` below, which is the
   * speech-recognition language and stays a separate axis. */
  lang?: Lang;
}) => {
  const [sttLang, setSttLang] = useState<LangCode>(defaultLang);
  // Stable for the component's lifetime — picked once, not re-rolled on
  // every render/state change.
  const [exampleIdx] = useState(() => Math.floor(Math.random() * 2));
  const { status, result, message, detail, start, stop, reset, supported } =
    useVoiceExpense(sttLang);
  const online = useOnlineStatus();
  const quota = useEntryQuota("voice");

  const recording = status === "recording";
  // "transcribing" only happens on the Cloudflare STT fallback (see
  // useVoiceExpense.ts) — grouped with "parsing" as one non-interruptible busy state.
  const busy = status === "parsing" || status === "transcribing";

  // A successful transcript opens the same fully-editable review used after
  // a receipt scan — items/amount/title all editable before it's saved —
  // instead of prefilling a manual form.
  if (status === "success" && result) {
    return (
      <ExpenseReviewModal
        initial={receiptToExpenseInput(result, null, "Expense")}
        imageUrl={null}
        validationWarning={result.metadata.validation_warning}
        wallets={wallets}
        defaultWalletId={defaultWalletId}
        lang={lang}
        onClose={reset}
        onSave={(input) => {
          onSubmit(input);
          reset();
        }}
      />
    );
  }

  // Placed after the success early-return above — a review modal already
  // in progress (recorded while online) should still be finishable even if
  // connectivity drops afterward; only fresh entry is blocked.
  if (!online) {
    return <EmptyState icon={WifiOff} message={t(lang, "offlineFeatureUnavailable")} />;
  }
  if (quota && quota.remaining <= 0) {
    return <EmptyState icon={Ban} message={t(lang, "voiceErrorQuotaExceeded")} />;
  }

  return (
    <div className="space-y-2">
      {/* Both STT tiers (native, Cloudflare Whisper) and the expense-parsing hint read this. */}
      {supported && (
        <div className="flex items-center gap-1.5 p-1 rounded-2xl border bg-card border-line w-fit mx-auto">
          {LANGS.map(({ code, label }) => (
            <button
              key={code}
              type="button"
              onClick={() => setSttLang(code)}
              aria-pressed={sttLang === code}
              className={
                "h-7 w-10 flex items-center justify-center rounded-xl text-xs font-bold transition-all " +
                (sttLang === code
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-ink-faint hover:text-ink")
              }
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        disabled={!supported || busy}
        // Tap-to-toggle, not press-and-hold — a held gesture (pointerdown
        // + setPointerCapture + waiting for pointerup/pointercancel) turned
        // out to silently break on Safari (both the installed PWA and a
        // plain browser tab): the button would show "recording" then
        // revert with zero error, meaning stop() was never actually being
        // called — Safari's Pointer Events + a competing touch consumer
        // (vaul's own drawer-level tracking) evidently doesn't reliably
        // deliver pointerup/cancel back to a capturing element there,
        // something Chrome for iOS's own gesture layer doesn't hit. A
        // single tap is a complete, atomic gesture with nothing to hold or
        // lose mid-way, so this whole class of bug can't recur — and it
        // means none of the previous hold-gesture workarounds
        // (data-vaul-no-drag, touch-none, select-none, setPointerCapture,
        // suppressing the long-press context menu) are needed anymore.
        onClick={() => (recording ? stop() : start())}
        aria-pressed={recording}
        className="flex w-full items-center justify-center gap-3 rounded-[var(--radius-card)] border border-line bg-elevated py-6 text-sm text-ink-soft transition-colors hover:bg-card-hover disabled:opacity-50"
      >
        <span
          className={
            recording
              ? "flex size-10 items-center justify-center rounded-full bg-brand text-brand-ink motion-safe:animate-pulse"
              : "flex size-10 items-center justify-center rounded-full bg-elevated text-ink-soft"
          }
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin" />
          ) : recording ? (
            <Square className="size-4" />
          ) : (
            <Mic className="size-5" />
          )}
        </span>
        {!supported
          ? t(lang, "voiceUnsupported")
          : status === "transcribing"
            ? t(lang, "voiceTranscribing")
            : status === "parsing"
              ? t(lang, "voiceParsing")
              : recording
                ? t(lang, "voiceListening")
                : t(lang, "voiceTapToSpeak")}
      </button>

      {supported && (
        <p className="text-center text-xs text-ink-faint">
          {EXAMPLE_SENTENCES[sttLang][exampleIdx]}
        </p>
      )}

      {status === "error" && message && (
        <div className="flex flex-col items-center gap-2">
          <p className="text-center text-xs whitespace-pre-line text-ink-faint">
            {t(lang, message)}
          </p>
          {/* Temporary diagnostic: voiceErrorGeneric collapses a few
              distinct causes (empty clip vs. clip uploaded but server
              said silence vs. transcribe request itself failing) into
              one message — this shows which, so a report from a real
              device is actionable without needing devtools access. */}
          {detail && (
            <p className="text-center text-[10px] font-mono text-ink-faint/70">{detail}</p>
          )}
          <Button variant="outline" size="sm" onClick={reset}>
            {t(lang, "scannerTryAgain")}
          </Button>
        </div>
      )}
    </div>
  );
};
