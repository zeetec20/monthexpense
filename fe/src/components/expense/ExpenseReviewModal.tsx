import { useEffect, useState } from "react";
import { Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { ExpenseItemsEditor, NumberField } from "./ExpenseItemsEditor";
import { WalletPicker } from "./WalletPicker";
import { CategoryPicker } from "./CategoryPicker";
import { ImageLightbox } from "@/components/receipt/ImageLightbox";
import { formatCurrency, formatDate } from "@/lib/format";
import { t, type Lang } from "@/i18n/translations";
import {
  computeExpenseTotals,
  BLANK_RECEIPT_DETAIL,
  type ExpenseInput,
  type ExpenseReceiptDetail,
} from "@/features/expense/expense.schema";
import type { Wallet } from "@/features/wallet/wallet.schema";

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={
        strong
          ? "flex items-baseline justify-between text-base font-semibold"
          : "flex items-baseline justify-between text-sm text-[var(--color-ink-2)]"
      }
    >
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/** A summary line that's a Row when viewing, a compact inline input when editing. */
function SummaryField({
  label,
  value,
  editing,
  onChange,
  formatted,
}: {
  label: string;
  value: number | null;
  editing: boolean;
  onChange: (value: number | null) => void;
  formatted: string;
}) {
  if (!editing) {
    if (value === null || value === 0) return null;
    return <Row label={label} value={formatted} />;
  }
  return (
    <div className="flex items-center justify-between gap-3 text-sm text-[var(--color-ink-2)]">
      <Label htmlFor={`expense-review-${label}`} className="shrink-0">
        {label}
      </Label>
      <NumberField id={`expense-review-${label}`} className="h-8 w-28 text-right" min="0" value={value} onChange={onChange} />
    </div>
  );
}

interface ExpenseReviewModalProps {
  /** Scan/voice result to review. */
  initial: ExpenseInput;
  imageUrl: string | null;
  /** Arithmetic cross-check from the receipt parser (see BE parser/validate.ts)
   * — informational only. Both languages always sent together; picked by `lang` below. */
  validationWarning?: { en: string; id: string } | null;
  wallets: Wallet[];
  defaultWalletId: string;
  lang?: Lang;
  onClose: () => void;
  onSave: (input: ExpenseInput) => void;
}

/**
 * Shared review step for both entry points that produce a structured draft
 * ahead of time — receipt scan and voice. Opens read-only; an explicit Edit
 * toggle switches to inputs. Item name/quantity/unit price (and tax/
 * discount/service charge/title/date/note/payment method) are the only
 * independently editable facts — item totals, the subtotal, and the grand
 * total are always computed from them (see computeExpenseTotals), never
 * their own typed field. Doesn't know how OCR, Whisper, the parser API, or
 * images work.
 *
 * Renders as plain content, not its own sheet — it's only ever rendered
 * from inside Scanner.tsx/VoiceEntry.tsx, which are themselves already
 * inside an open BottomSheet (App.tsx). Wrapping it in a second BottomSheet
 * used to nest two independent Radix Dialogs (two backdrops, two slide
 * animations, two scroll containers) on top of each other — the visual
 * "glitch" on the review step.
 */
export function ExpenseReviewModal({
  initial,
  imageUrl,
  validationWarning,
  wallets,
  defaultWalletId,
  lang = "id",
  onClose,
  onSave,
}: ExpenseReviewModalProps) {
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Re-seed whenever a new result opens the modal (e.g. rescanning/re-recording) — starts read-only again.
  // walletId isn't part of a scan/voice result, so it's defaulted here rather
  // than threaded through receiptToExpenseInput. category *is* part of the
  // result (the model's own guess) — only falls back to "other" when it
  // genuinely couldn't tell.
  useEffect(() => {
    setDraft({ ...initial, walletId: initial.walletId ?? defaultWalletId, category: initial.category ?? "food_snack" });
    setEditing(false);
  }, [initial, defaultWalletId]);

  const detail = draft.receiptDetail ?? null;
  const totals = detail ? computeExpenseTotals(detail) : null;
  const displayAmount = totals ? (totals.total ?? draft.amount) : draft.amount;
  const showMerchantCaption = detail?.merchantName && detail.merchantName !== draft.title;

  function updateDetail(patch: Partial<ExpenseReceiptDetail>) {
    setDraft((d) => ({ ...d, receiptDetail: { ...(d.receiptDetail ?? BLANK_RECEIPT_DETAIL), ...patch } }));
  }

  function handleSave() {
    onSave(
      detail && totals
        ? {
            ...draft,
            amount: totals.total ?? draft.amount,
            // Persist the resolved total back onto the saved detail — so
            // re-opening/editing later starts from the current true total
            // instead of a stale null (see computeExpenseTotals).
            receiptDetail: { ...detail, subtotal: totals.subtotal, total: totals.total },
          }
        : draft,
    );
  }

  return (
    <div className="space-y-4">
        {imageUrl && (
          <button
            type="button"
            onClick={() => setLightboxOpen(true)}
            className="block w-full cursor-zoom-in"
            aria-label="View full-screen"
          >
            <img
              src={imageUrl}
              alt="Scanned receipt"
              className="max-h-64 w-full rounded-[var(--radius-card)] border border-[var(--color-rule)] object-contain"
            />
          </button>
        )}
        <ImageLightbox imageUrl={imageUrl} open={lightboxOpen} onClose={() => setLightboxOpen(false)} />

        <div className="flex flex-row items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            {editing ? (
              <>
                <Label htmlFor="expense-review-title">{t(lang, "whatWasItFor")}</Label>
                <Input
                  id="expense-review-title"
                  value={draft.title}
                  onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                />
              </>
            ) : (
              <>
                <p className="text-lg font-semibold">{draft.title}</p>
                {showMerchantCaption && <p className="text-sm text-[var(--color-ink-3)]">{detail.merchantName}</p>}
                <p className="text-sm text-[var(--color-ink-3)]">
                  {formatDate(draft.date)}
                  {detail?.time ? ` · ${detail.time}` : ""}
                  {detail?.receiptNumber ? ` · #${detail.receiptNumber}` : ""}
                </p>
              </>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0"
            onClick={() => setEditing((e) => !e)}
            aria-label={editing ? "Done editing" : "Edit"}
          >
            {editing ? <Check className="size-4" /> : <Pencil className="size-4" />}
          </Button>
        </div>

        {validationWarning && <p className="text-sm text-[var(--color-warning,#a15c00)]">{validationWarning[lang]}</p>}

        {editing && (
          <div className="grid grid-cols-2 gap-3">
            {!detail && (
              <div className="space-y-1.5">
                <Label htmlFor="expense-review-amount">{t(lang, "amountLabel")}</Label>
                <NumberField
                  id="expense-review-amount"
                  min="0"
                  value={draft.amount}
                  onChange={(amount) => setDraft((d) => ({ ...d, amount: amount ?? 0 }))}
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="expense-review-date">{t(lang, "dateLabel")}</Label>
              <DatePicker
                id="expense-review-date"
                value={draft.date}
                onChange={(date) => setDraft((d) => ({ ...d, date }))}
                lang={lang}
              />
            </div>
          </div>
        )}

        {!editing && !detail && <Row label={t(lang, "amountLabel")} value={formatCurrency(draft.amount, draft.currency)} strong />}

        {detail && (
          <>
            <Separator />

            {editing && (
              <div className="space-y-1.5">
                <Label htmlFor="expense-review-merchant">{t(lang, "merchantLabel")}</Label>
                <Input
                  id="expense-review-merchant"
                  value={detail.merchantName ?? ""}
                  onChange={(e) => updateDetail({ merchantName: e.target.value || null })}
                  placeholder={t(lang, "merchantPlaceholder")}
                />
              </div>
            )}

            {/* total: null — an item edit invalidates the originally-
                extracted total, switching computeExpenseTotals over to
                live subtotal+tax derivation (see its doc comment). */}
            <ExpenseItemsEditor
              items={detail.items}
              editing={editing}
              onChange={(items) => updateDetail({ items, total: null })}
            />

            <div className="space-y-1.5 border-t border-[var(--color-rule)] pt-3">
              {totals?.subtotal !== null && <Row label={t(lang, "subtotalLabel")} value={formatCurrency(totals?.subtotal ?? null, draft.currency)} />}
              <SummaryField
                label={t(lang, "discountLabel")}
                value={detail.discount}
                editing={editing}
                onChange={(discount) => updateDetail({ discount, total: null })}
                formatted={`-${formatCurrency(detail.discount, draft.currency)}`}
              />
              <SummaryField
                label={t(lang, "taxLabel")}
                value={detail.tax}
                editing={editing}
                onChange={(tax) => updateDetail({ tax, total: null })}
                formatted={formatCurrency(detail.tax, draft.currency)}
              />
              <SummaryField
                label={t(lang, "serviceChargeLabel")}
                value={detail.serviceCharge}
                editing={editing}
                onChange={(serviceCharge) => updateDetail({ serviceCharge, total: null })}
                formatted={formatCurrency(detail.serviceCharge, draft.currency)}
              />
              <Row label={t(lang, "totalLabel")} value={formatCurrency(displayAmount, draft.currency)} strong />
            </div>

            {(editing || detail.paymentMethod) && (
              <div className="space-y-1.5 border-t border-[var(--color-rule)] pt-3">
                {editing ? (
                  <>
                    <Label htmlFor="expense-review-payment-method">{t(lang, "paymentMethodLabel")}</Label>
                    <Input
                      id="expense-review-payment-method"
                      value={detail.paymentMethod ?? ""}
                      onChange={(e) => updateDetail({ paymentMethod: e.target.value || null })}
                      placeholder={t(lang, "paymentMethodPlaceholder")}
                    />
                  </>
                ) : (
                  <Badge variant="secondary">{detail.paymentMethod}</Badge>
                )}
              </div>
            )}
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <WalletPicker
            id="expense-review-wallet"
            wallets={wallets}
            value={draft.walletId ?? defaultWalletId}
            onChange={(walletId) => setDraft((d) => ({ ...d, walletId }))}
            lang={lang}
          />
          <CategoryPicker
            id="expense-review-category"
            value={draft.category ?? "food_snack"}
            onChange={(category) => setDraft((d) => ({ ...d, category }))}
            lang={lang}
          />
        </div>

        {(editing || draft.note) && (
          <div className="space-y-1.5">
            <Label htmlFor="expense-review-note">{t(lang, "noteLabel")}</Label>
            {editing ? (
              <Textarea
                id="expense-review-note"
                value={draft.note ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value || null }))}
                rows={2}
                placeholder={t(lang, "notePlaceholder")}
              />
            ) : (
              <p className="text-sm text-[var(--color-ink-3)]">{draft.note}</p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            {t(lang, "discardButton")}
          </Button>
          <Button className="flex-1" disabled={!draft.title.trim() || !draft.amount} onClick={handleSave}>
            {t(lang, "saveButton")}
          </Button>
        </div>
    </div>
  );
}
