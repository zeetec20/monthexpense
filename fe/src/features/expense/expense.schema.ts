import { z } from "zod";
import type { Receipt } from "@/features/receipt/receipt.schema";
import { localDateKey } from "@/lib/format";

export const expenseSourceSchema = z.enum(["scan", "manual", "voice"]);

// Fixed list, not model-extensible — matches text-processing-slm's
// ReceiptCategorySchema (src/schemas/receipt.ts) value-for-value, so a
// scan/voice-picked category and a manually-picked one land on the same
// slugs. CategoryPicker.tsx is the only place that renders these labels.
export const EXPENSE_CATEGORIES = [
  { value: "food_snack", label: "Food & Snack" },
  { value: "grocery", label: "Grocery" },
  { value: "transportation", label: "Transportation" },
  { value: "bills", label: "Bills" },
  { value: "subscription", label: "Subscription" },
  { value: "investment", label: "Investment" },
  { value: "entertainment", label: "Entertainment" },
  { value: "other", label: "Other" },
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["value"];

/** A pulled-from-Sheets expense's category comes back as whatever's in the
 * Category column — which is the display LABEL ("Food & Snack"), not the
 * slug ("food_snack"): sheets-sync.api.ts's txnRow writes
 * CATEGORY_LABELS[exp.category] on purpose, for Sheets-side formulas to
 * group on directly. Used by that same file to fix it back up on the way
 * in, so category-keyed aggregation (AnalyticsPage/HomeDashboard) can keep
 * doing a strict slug match. Passes an already-valid slug through
 * unchanged; anything unrecognized (blank cell, manual edit in the sheet)
 * becomes null rather than guessing. */
export const normalizeExpenseCategory = (
  value: string | null | undefined,
): ExpenseCategory | null => {
  if (!value) return null;
  if (EXPENSE_CATEGORIES.some((c) => c.value === value)) return value as ExpenseCategory;
  return EXPENSE_CATEGORIES.find((c) => c.label === value)?.value ?? null;
};

// The itemized parts of a scan/voice result beyond title/amount/date/currency
// — kept as a snapshot at save-time so a detail view has something to show.
// null for manual entries and for scan/voice results with nothing to
// itemize/report (voice reuses the exact same Receipt shape as scan now —
// see receiptToExpenseInput below — so a spoken merchant/payment/tax gets
// captured here too, whenever the speaker actually stated it).
export const expenseReceiptDetailSchema = z.object({
  time: z.string().nullable(),
  receiptNumber: z.string().nullable(),
  // Title is user-editable and can drift from this — kept separately so the
  // original merchant is never lost once someone renames the expense.
  merchantName: z.string().nullable(),
  merchantAddress: z.string().nullable(),
  merchantPhone: z.string().nullable(),
  items: z.array(
    z.object({
      name: z.string().nullable(),
      quantity: z.number().nullable(),
      unitPrice: z.number().nullable(),
      total: z.number().nullable(),
    }),
  ),
  subtotal: z.number().nullable(),
  tax: z.number().nullable(),
  discount: z.number().nullable(),
  serviceCharge: z.number().nullable(),
  // The receipt's own printed/extracted grand total — ground truth for
  // computeExpenseTotals below until an edit invalidates it (see
  // ExpenseReviewModal.tsx). .optional() so records saved before this
  // field existed still parse (same convention as receiptImageId/walletId).
  total: z.number().nullable().optional(),
  paymentMethod: z.string().nullable(),
  cashReceived: z.number().nullable(),
  change: z.number().nullable(),
});

export const expenseInputSchema = z.object({
  title: z.string().min(1, "Enter a title"),
  amount: z.number().positive("Amount is required"),
  currency: z.string().min(1).default("IDR"),
  date: z.string().min(1, "Pick a date"),
  note: z.string().nullable().optional(),
  receiptDetail: expenseReceiptDetailSchema.nullable().optional(),
  // Id into the IndexedDB image store (src/lib/image/image-store.ts), not the
  // image itself — keeps expense records small JSON. .optional() so records
  // saved before this field existed still parse. null for manual/voice
  // entries and scans the user declined to persist the photo for.
  receiptImageId: z.string().nullable().optional(),
  // Which wallet this expense counts against. .optional() for the same
  // reason receiptImageId is — records saved before wallets existed still
  // parse; callers resolve a missing value to the default wallet's id
  // (see wallet.store.ts's seeded "Main Wallet").
  walletId: z.string().optional(),
  // .nullable() (model can genuinely not know) + .optional() (records
  // saved before this field existed) — same pattern as walletId. Lives at
  // the top level, not nested in receiptDetail: manual entries have no
  // receiptDetail at all, but should still carry a category.
  category: z.string().nullable().optional(),
  // Flags a normal expense as a scheduled bill ("Tagihan Terjadwal") or a
  // debt/IOU ("Hutang") instead of a plain one-off ("Harian" — the
  // default, null/absent). Both are real Expense records, not a separate
  // data model — see ManualEntryForm.tsx (creation) and
  // ExpenseSchedulePage.tsx (the calendar/tabs view over them).
  scheduleType: z.enum(["scheduled", "debt"]).nullable().optional(),
  // "scheduled" bill paid or not — always counts toward spend totals
  // either way, see schedule.ts's isCountedExpense.
  paid: z.boolean().optional(),
  // "debt" settled (friend paid it back) or not — once settled the
  // record stays (still visible everywhere) but is excluded from spend
  // totals, see schedule.ts's isCountedExpense.
  settled: z.boolean().optional(),
});

export const expenseSchema = expenseInputSchema.extend({
  id: z.string(),
  source: expenseSourceSchema,
  createdAt: z.string(),
});

export type ExpenseReceiptDetail = z.infer<typeof expenseReceiptDetailSchema>;
export type ExpenseInput = z.infer<typeof expenseInputSchema>;
export type Expense = z.infer<typeof expenseSchema>;
export type ExpenseSource = z.infer<typeof expenseSourceSchema>;
export type ExpenseReceiptItem = ExpenseReceiptDetail["items"][number];

/** Shared "nothing itemized yet" starting point — ExpenseReviewModal
 * (editing an existing scan/voice/text result) and ManualEntryForm
 * (attaching receiptDetail only once items are added) both spread onto
 * this rather than each hand-listing every field. */
export const BLANK_RECEIPT_DETAIL: ExpenseReceiptDetail = {
  time: null,
  receiptNumber: null,
  merchantName: null,
  merchantAddress: null,
  merchantPhone: null,
  items: [],
  subtotal: null,
  tax: null,
  discount: null,
  serviceCharge: null,
  total: null,
  paymentMethod: null,
  cashReceived: null,
  change: null,
};

/** An item's total is derived from quantity × unit price, never its own typed fact. */
export const computeItemTotal = (item: ExpenseReceiptItem): number | null => {
  if (item.quantity === null || item.unitPrice === null) return null;
  return item.quantity * item.unitPrice;
};

/**
 * Subtotal is derived (sum of item totals). Grand total prefers the
 * receipt's own printed/extracted `detail.total` as ground truth — trusting
 * it outright instead of reconstructing from subtotal+tax-discount+service,
 * which silently breaks whenever tax is informational/already included in
 * item prices (common — many receipts print "all prices inclusive tax") or
 * whenever rounding/service nuances don't reconcile exactly. Only falls
 * back to that derivation once `detail.total` is null — which
 * ExpenseReviewModal.tsx's edit handlers deliberately set once the user
 * actually edits an item/tax/discount/service value, invalidating the
 * originally-extracted total.
 */
export const computeExpenseTotals = (
  detail: ExpenseReceiptDetail,
): { subtotal: number | null; total: number | null } => {
  const itemTotals = detail.items.map(computeItemTotal);
  // length check first: .every() is vacuously true on an empty array, which
  // would otherwise compute subtotal 0 for "no items" instead of "nothing
  // to derive from" — the latter is what lets a plain voice expense's
  // amount (no items at all) survive instead of getting zeroed out.
  const computedSubtotal =
    itemTotals.length > 0 && itemTotals.every((t): t is number => t !== null)
      ? itemTotals.reduce((sum, t) => sum + t, 0)
      : null;
  const subtotal = computedSubtotal ?? detail.subtotal ?? null;

  if (detail.total !== null && detail.total !== undefined) {
    return { subtotal, total: detail.total };
  }

  if (subtotal === null) return { subtotal: null, total: null };

  const total = subtotal - (detail.discount ?? 0) + (detail.tax ?? 0) + (detail.serviceCharge ?? 0);
  return { subtotal, total };
};

/**
 * Condenses a parsed Receipt into the same shape manual entries use — shared
 * by both entry points that produce one (scan and voice; see ai/prompt.ts's
 * EXPENSE_SYSTEM_PROMPT on the BE side for why voice returns this same
 * shape). `fallbackTitle` only matters when neither suggested_title nor a
 * merchant name came back — "Receipt" reads oddly for a voice-sourced
 * "taxi 50 ribu" with no named place, so VoiceEntry passes "Expense" instead.
 */
export const receiptToExpenseInput = (
  receipt: Receipt,
  imageId: string | null = null,
  fallbackTitle = "Receipt",
): ExpenseInput => {
  const itemCount = receipt.items.length;
  return {
    title: receipt.suggested_title || receipt.merchant.name || fallbackTitle,
    amount: receipt.total ?? 0,
    currency: receipt.metadata.currency ?? "IDR",
    date: receipt.transaction.date ?? localDateKey(),
    note: itemCount > 0 ? `${itemCount} item${itemCount === 1 ? "" : "s"}` : null,
    receiptImageId: imageId,
    category: receipt.metadata.category ?? "food_snack",
    receiptDetail: {
      time: receipt.transaction.time,
      receiptNumber: receipt.transaction.receipt_number,
      merchantName: receipt.merchant.name,
      merchantAddress: receipt.merchant.address,
      merchantPhone: receipt.merchant.phone,
      items: receipt.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        total: item.total,
      })),
      subtotal: receipt.subtotal,
      tax: receipt.tax,
      discount: receipt.discount,
      serviceCharge: receipt.service_charge,
      // Ground truth for computeExpenseTotals until an edit invalidates it
      // — see that function's doc comment.
      total: receipt.total,
      paymentMethod: receipt.payment.method,
      cashReceived: receipt.payment.cash_received ?? null,
      change: receipt.payment.change ?? null,
    },
  };
};
