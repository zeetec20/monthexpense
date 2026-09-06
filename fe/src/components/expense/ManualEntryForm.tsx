import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { NumberInput } from "@/components/ui/number-input";
import { DatePicker } from "@/components/ui/date-picker";
import { WalletPicker } from "./WalletPicker";
import { CategoryPicker } from "./CategoryPicker";
import { ExpenseItemsEditor } from "./ExpenseItemsEditor";
import { t, type Lang, type TKey } from "@/i18n/translations";
import {
  expenseInputSchema,
  computeExpenseTotals,
  BLANK_RECEIPT_DETAIL,
  type Expense,
  type ExpenseInput,
  type ExpenseReceiptItem,
} from "@/features/expense/expense.schema";
import { localDateKey, formatCurrency } from "@/lib/format";
import type { Wallet } from "@/features/wallet/wallet.schema";

type EntryType = "normal" | "scheduled" | "debt";

interface ManualEntryFormProps {
  /** When set, edits this expense instead of creating a new one — fields
   * seed from it, submit produces a single patch instead of an addExpense
   * fan-out. Caller should remount the form per edited expense (key={expense.id})
   * rather than relying on a reseed effect — see App.tsx. */
  expense?: Expense | null;
  onSubmit: (input: ExpenseInput) => void;
  wallets: Wallet[];
  defaultWalletId: string;
  /** Extra content rendered above the fields — VoiceEntry uses this for its mic affordance. */
  header?: ReactNode;
  submitLabel?: string;
  lang?: Lang;
}

const today = localDateKey;

// expenseInputSchema's own zod messages are internal/English-only (shared
// with non-UI consumers) — map the fields actually shown in this form to
// real translations instead of rendering issue.message as-is.
const FIELD_ERROR_KEY: Record<string, TKey> = {
  title: "manualErrorTitleRequired",
  amount: "manualErrorAmountRequired",
  date: "manualErrorDateRequired",
};

export function ManualEntryForm({
  expense,
  onSubmit,
  wallets,
  defaultWalletId,
  header,
  submitLabel,
  lang = "id",
}: ManualEntryFormProps) {
  const id = useId();
  const resolvedSubmitLabel = submitLabel ?? t(lang, "submitExpense");
  const [entryType, setEntryType] = useState<EntryType>(() => expense?.scheduleType ?? "normal");
  const [title, setTitle] = useState(() => expense?.title ?? "");
  const [amount, setAmount] = useState<number | null>(() => expense?.amount ?? null);
  const [date, setDate] = useState(() => expense?.date ?? today());
  const [dates, setDates] = useState<string[]>([today()]);
  const [note, setNote] = useState(() => expense?.note ?? "");
  const [walletId, setWalletId] = useState(() => expense?.walletId ?? defaultWalletId);
  const [category, setCategory] = useState(() => expense?.category ?? "food_snack");
  const [items, setItems] = useState<ExpenseReceiptItem[]>(() => expense?.receiptDetail?.items ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Itemized when there's anything to itemize — amount is then derived
  // (computeExpenseTotals, same as Scan/Voice/Text review) instead of
  // separately typed, same "total is never its own fact" rule
  // ExpenseReviewModal already follows.
  const totals = items.length > 0 ? computeExpenseTotals({ ...BLANK_RECEIPT_DETAIL, items }) : null;

  function reset() {
    setEntryType("normal");
    setTitle("");
    setAmount(null);
    setDate(today());
    setDates([today()]);
    setNote("");
    setWalletId(defaultWalletId);
    setCategory("food_snack");
    setItems([]);
    setErrors({});
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    // Editing is always exactly one record — never the multi-date fan-out
    // a fresh "Tagihan Terjadwal" create can produce.
    const targetDates = !expense && entryType === "scheduled" ? dates.filter(Boolean) : [date];
    if (!expense && entryType === "scheduled" && targetDates.length === 0) {
      setErrors({ date: t(lang, "pickAtLeastOneDate") });
      return;
    }

    // Validate once against the first date — title/amount/wallet/category
    // are shared across every entry a multi-date Tagihan Terjadwal submit
    // creates, only the date itself varies per entry.
    const base = {
      title,
      amount: items.length > 0 ? (totals?.total ?? 0) : (amount ?? 0),
      currency: "IDR",
      note: note || null,
      walletId,
      category,
      ...(items.length > 0
        ? { receiptDetail: { ...BLANK_RECEIPT_DETAIL, items, subtotal: totals?.subtotal ?? null } }
        : {}),
    };
    const probe = expenseInputSchema.safeParse({ ...base, date: targetDates[0] });
    if (!probe.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of probe.error.issues) {
        const field = String(issue.path[0]);
        const key = FIELD_ERROR_KEY[field];
        fieldErrors[field] = key ? t(lang, key) : issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    for (const d of targetDates) {
      const result = expenseInputSchema.parse({
        ...base,
        date: d,
        ...(entryType === "scheduled"
          ? { scheduleType: "scheduled" as const, paid: expense?.scheduleType === "scheduled" ? expense.paid : false }
          : {}),
        ...(entryType === "debt"
          ? { scheduleType: "debt" as const, settled: expense?.scheduleType === "debt" ? expense.settled : false }
          : {}),
        // A create never has anything to clear; an edit switching back to
        // Normal needs this so the patch actually drops the old schedule.
        ...(expense && entryType === "normal" ? { scheduleType: null } : {}),
      });
      onSubmit(result);
    }
    if (!expense) reset();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {header}

      <div className="flex items-center gap-1.5 p-1 rounded-2xl border bg-card border-line">
        {(["normal", "scheduled", "debt"] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setEntryType(type)}
            className={
              "flex-1 py-1.5 rounded-xl text-[11px] font-bold transition-all " +
              (entryType === type ? "bg-emerald-600 text-white shadow-sm" : "text-ink-faint hover:text-ink")
            }
          >
            {t(lang, type === "normal" ? "typeNormal" : type === "scheduled" ? "typeScheduled" : "typeDebt")}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-title`}>{t(lang, "whatWasItFor")}</Label>
        <Input
          id={`${id}-title`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t(lang, "titlePlaceholder")}
          aria-invalid={!!errors.title}
        />
        {errors.title && <p className="text-xs text-red-500">{errors.title}</p>}
      </div>

      {items.length === 0 ? (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-amount`}>{t(lang, "amountLabel")}</Label>
          <NumberInput
            id={`${id}-amount`}
            value={amount}
            onChange={setAmount}
            placeholder="0"
            aria-invalid={!!errors.amount}
          />
          {errors.amount && <p className="text-xs text-red-500">{errors.amount}</p>}
        </div>
      ) : (
        // Amount is derived once items exist — same "never its own typed
        // fact" rule ExpenseReviewModal follows for a scan/voice/text
        // result's total.
        <div className="space-y-1.5">
          <Label>{t(lang, "amountLabel")}</Label>
          <p className="text-lg font-semibold tabular-nums">{formatCurrency(totals?.total ?? null, "IDR")}</p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label>{t(lang, "itemsLabel")}</Label>
        <ExpenseItemsEditor items={items} editing onChange={setItems} />
      </div>

      {!expense && entryType === "scheduled" ? (
        <div className="space-y-1.5">
          <Label>{t(lang, "typeScheduled")}</Label>
          <div className="space-y-2">
            {dates.map((d, i) => (
              <div key={i} className="flex items-center gap-2">
                <DatePicker
                  value={d}
                  onChange={(v) => setDates((prev) => prev.map((p, pi) => (pi === i ? v : p)))}
                  minDate={today()}
                  disabledDates={dates.filter((_, pi) => pi !== i)}
                  lang={lang}
                  className="flex-1"
                />
                {dates.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setDates((prev) => prev.filter((_, pi) => pi !== i))}
                    aria-label="Remove date"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setDates((prev) => [...prev, today()])}>
            <Plus className="size-3.5" /> {t(lang, "addDate")}
          </Button>
          {errors.date && <p className="text-xs text-red-500">{errors.date}</p>}
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-date`}>{t(lang, "dateLabel")}</Label>
          <DatePicker id={`${id}-date`} value={date} onChange={setDate} lang={lang} />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-note`}>{t(lang, "noteLabel")}</Label>
        <Textarea
          id={`${id}-note`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t(lang, "notePlaceholder")}
          rows={2}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <WalletPicker id={`${id}-wallet`} wallets={wallets} value={walletId} onChange={setWalletId} lang={lang} />
        <CategoryPicker id={`${id}-category`} value={category} onChange={setCategory} lang={lang} />
      </div>

      <Button type="submit" className="w-full">
        {resolvedSubmitLabel}
      </Button>
    </form>
  );
}
