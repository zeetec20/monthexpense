import { useEffect, useRef, useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatCurrency, formatDate } from "@/lib/format";
import { getImage } from "@/lib/image/image-store";
import { ImageLightbox } from "@/components/receipt/ImageLightbox";
import { ImageOff } from "lucide-react";
import { EXPENSE_CATEGORIES, type Expense, type ExpenseInput } from "@/features/expense/expense.schema";
import type { Wallet } from "@/features/wallet/wallet.schema";
import { t, type Lang } from "@/i18n/translations";

const SOURCE_LABEL_KEY: Record<Expense["source"], "sourceScanned" | "sourceManual" | "sourceVoice"> = {
  scan: "sourceScanned",
  manual: "sourceManual",
  voice: "sourceVoice",
};

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

export function ExpenseDetailModal({
  expense: expenseProp,
  wallets,
  onClose,
  onSave,
  onRemove,
  onEdit,
  lang = "id",
}: {
  expense: Expense | null;
  wallets: Wallet[];
  onClose: () => void;
  onSave: (id: string, patch: Partial<ExpenseInput>) => void;
  onRemove: (id: string) => void;
  onEdit: (expense: Expense) => void;
  lang?: Lang;
}) {
  // Keep rendering the last non-null expense while the sheet closes —
  // `expenseProp` going null used to early-return `null` here on the
  // same tick, tearing the Content DOM node down before vaul's own
  // exit-animation ever got a chance to run. Everything below reads the
  // latched `expense`, so the sheet stays showing real content all the
  // way through its close animation; `open` (passed to BottomSheet
  // further down) still keys off the live `expenseProp`.
  const lastExpenseRef = useRef<Expense | null>(expenseProp);
  if (expenseProp) lastExpenseRef.current = expenseProp;
  const expense = expenseProp ?? lastExpenseRef.current;

  const [title, setTitle] = useState(expense?.title ?? "");
  // undefined = not checked yet, null = checked and missing/expired (45-day
  // sweep or never saved), string = loaded object URL.
  const [imageUrl, setImageUrl] = useState<string | null | undefined>(undefined);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Re-seed the input whenever a different expense is opened — skipped
  // while closing (expenseProp null) so the header doesn't flash blank
  // mid-animation.
  useEffect(() => {
    if (expenseProp) setTitle(expenseProp.title);
  }, [expenseProp?.id, expenseProp?.title]);

  useEffect(() => {
    if (!expenseProp) return;
    const imageId = expenseProp.receiptImageId;
    if (!imageId) {
      setImageUrl(null);
      return;
    }
    setImageUrl(undefined);
    let cancelled = false;
    void getImage(imageId).then((blob) => {
      if (cancelled) return;
      setImageUrl(blob ? URL.createObjectURL(blob) : null);
    });
    return () => {
      cancelled = true;
    };
  }, [expenseProp?.receiptImageId]);

  // Revoke whenever we move on to a different object URL (or unmount).
  useEffect(() => () => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  if (!expense) return null;
  const walletName = wallets.find((w) => w.id === expense.walletId)?.name;
  const categoryLabel = EXPENSE_CATEGORIES.find((c) => c.value === expense.category)?.label;
  const detail = expense.receiptDetail;
  const currency = expense.currency;
  const titleChanged = title.trim() && title.trim() !== expense.title;
  // Title is user-editable and can drift from the original merchant name —
  // show the merchant as a caption once they've actually diverged.
  const showMerchantCaption = detail?.merchantName && detail.merchantName !== title;

  return (
    <>
    <BottomSheet open={expenseProp !== null} onClose={onClose} title={t(lang, "expenseDetailTitle")} className="max-h-[85dvh] flex flex-col">
      {/* overflow-y-auto belongs on this nested div, not the sheet's own
          Content element — vaul marks that touch-action:none
          unconditionally for its own gesture tracking, so native scroll
          never engages there no matter what (see NotificationDrawer.tsx,
          the pattern every other sheet was brought in line with). */}
      <div className="min-h-0 flex-1 overflow-y-auto -mx-1 px-1 space-y-4">
        {expense.receiptImageId && (
          imageUrl ? (
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              className="block w-full cursor-zoom-in"
              aria-label={t(lang, "viewFullscreenLabel")}
            >
              <img
                src={imageUrl}
                alt="Scanned receipt"
                className="max-h-64 w-full rounded-[var(--radius-card)] border border-[var(--color-rule)] object-contain"
              />
            </button>
          ) : imageUrl === null ? (
            <div className="flex h-32 w-full flex-col items-center justify-center gap-1 rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule)] text-[var(--color-ink-3)]">
              <ImageOff className="size-5" />
              <p className="text-xs">{t(lang, "photoUnavailable")}</p>
            </div>
          ) : null
        )}
        <ImageLightbox imageUrl={imageUrl ?? null} open={lightboxOpen} onClose={() => setLightboxOpen(false)} />

        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="w-fit font-mono text-[10px] uppercase">
              {t(lang, SOURCE_LABEL_KEY[expense.source])}
            </Badge>
            {walletName && (
              <Badge variant="secondary" className="w-fit text-[10px]">
                {walletName}
              </Badge>
            )}
            {categoryLabel && (
              <Badge variant="secondary" className="w-fit text-[10px]">
                {categoryLabel}
              </Badge>
            )}
          </div>

          {/* Styled to read as a heading (matches ReceiptHeader's merchant
              name) rather than a plain form field, while staying editable. */}
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => titleChanged && onSave(expense.id, { title: title.trim() })}
            aria-label={t(lang, "expenseTitleFieldLabel")}
            className="h-auto border-none p-0 text-lg font-semibold shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          {showMerchantCaption && (
            <p className="text-sm text-[var(--color-ink-3)]">{detail.merchantName}</p>
          )}
          {(detail?.merchantAddress || detail?.merchantPhone) && (
            <p className="text-sm text-[var(--color-ink-3)]">
              {[detail.merchantAddress, detail.merchantPhone].filter(Boolean).join(" · ")}
            </p>
          )}

          <p className="text-sm text-[var(--color-ink-3)]">
            {formatDate(expense.date)}
            {detail?.time ? ` · ${detail.time}` : ""}
            {detail?.receiptNumber ? ` · #${detail.receiptNumber}` : ""}
          </p>
        </div>

        <Separator />

        {detail ? (
          <>
            {detail.items.length > 0 ? (
              <ul className="space-y-3">
                {detail.items.map((item, index) => (
                  <li key={index} className="flex items-start justify-between gap-4 text-sm">
                    <div>
                      <p className="font-medium">{item.name ?? t(lang, "unnamedItem")}</p>
                      <p className="text-[var(--color-ink-3)]">
                        {item.quantity ?? "–"} × {formatCurrency(item.unitPrice, currency)}
                      </p>
                    </div>
                    <p className="shrink-0 font-medium tabular-nums">
                      {formatCurrency(item.total, currency)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[var(--color-ink-3)]">{t(lang, "noLineItemsDetected")}</p>
            )}

            <div className="space-y-1.5 border-t border-[var(--color-rule)] pt-3">
              {detail.subtotal !== null && (
                <Row label={t(lang, "subtotalLabel")} value={formatCurrency(detail.subtotal, currency)} />
              )}
              {detail.discount !== null && detail.discount !== 0 && (
                <Row label={t(lang, "discountLabel")} value={`-${formatCurrency(detail.discount, currency)}`} />
              )}
              {detail.tax !== null && <Row label={t(lang, "taxLabel")} value={formatCurrency(detail.tax, currency)} />}
              {detail.serviceCharge !== null && detail.serviceCharge !== 0 && (
                <Row label={t(lang, "serviceChargeLabel")} value={formatCurrency(detail.serviceCharge, currency)} />
              )}
              <Row label={t(lang, "totalLabel")} value={formatCurrency(expense.amount, currency)} strong />
            </div>

            {(detail.paymentMethod || detail.cashReceived !== null || detail.change !== null) && (
              <div className="space-y-1.5 border-t border-[var(--color-rule)] pt-3 text-sm">
                <div className="flex items-center justify-between">
                  {detail.paymentMethod ? <Badge variant="secondary">{detail.paymentMethod}</Badge> : <span />}
                  <span className="font-medium tabular-nums">{formatCurrency(expense.amount, currency)}</span>
                </div>
                {detail.cashReceived !== null && (
                  <Row label={t(lang, "cashLabel")} value={formatCurrency(detail.cashReceived, currency)} />
                )}
                {detail.change !== null && (
                  <Row label={t(lang, "changeLabel")} value={formatCurrency(detail.change, currency)} />
                )}
              </div>
            )}
          </>
        ) : (
          <Row label={t(lang, "amountLabel")} value={formatCurrency(expense.amount, currency)} strong />
        )}

        {expense.note && <p className="text-sm text-[var(--color-ink-3)]">{expense.note}</p>}
        <p className="text-xs text-[var(--color-ink-3)]">{t(lang, "addedOn", { date: formatDate(expense.createdAt) })}</p>

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30"
            onClick={() => setConfirmDeleteOpen(true)}
          >
            {t(lang, "deleteButton")}
          </Button>
          <Button
            variant="outline"
            className="flex-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30"
            onClick={() => onEdit(expense)}
          >
            {t(lang, "editButton")}
          </Button>
        </div>
      </div>
    </BottomSheet>

    <ConfirmDialog
      open={confirmDeleteOpen}
      onOpenChange={setConfirmDeleteOpen}
      title={t(lang, "deleteExpenseConfirmTitle")}
      description={t(lang, "deleteExpenseConfirmDescription")}
      confirmLabel={t(lang, "deleteButton")}
      cancelLabel={t(lang, "cancel")}
      destructive
      onConfirm={() => {
        onRemove(expense.id);
        onClose();
      }}
    />
    </>
  );
}
