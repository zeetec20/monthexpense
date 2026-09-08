import { test, expect, beforeEach } from "bun:test";

// ponytail: bun's runtime has no `localStorage` by default — minimal in-memory
// shim, just enough Storage surface for expense.store.ts to run under `bun test`.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  clear() {
    this.store.clear();
  }
}
globalThis.localStorage = new MemoryStorage() as unknown as Storage;

const { readAll, writeAll } = await import("./expense.store");
const {
  expenseInputSchema,
  expenseSchema,
  receiptToExpenseInput,
  computeItemTotal,
  computeExpenseTotals,
  normalizeExpenseCategory,
} = await import("./expense.schema");

beforeEach(() => {
  localStorage.clear();
});

// normalizeExpenseCategory — a pulled-from-Sheets expense's category comes
// back as GAS's display label ("Food & Snack"), not the slug
// ("food_snack") — see sheets-sync.api.ts's normalizePulledExpenses.
test("normalizeExpenseCategory passes an already-valid slug through unchanged", () => {
  expect(normalizeExpenseCategory("food_snack")).toBe("food_snack");
});

test("normalizeExpenseCategory maps a known GAS display label back to its slug", () => {
  expect(normalizeExpenseCategory("Food & Snack")).toBe("food_snack");
  expect(normalizeExpenseCategory("Grocery")).toBe("grocery");
});

test("normalizeExpenseCategory returns null for blank or unrecognized input", () => {
  expect(normalizeExpenseCategory(null)).toBe(null);
  expect(normalizeExpenseCategory(undefined)).toBe(null);
  expect(normalizeExpenseCategory("")).toBe(null);
  expect(normalizeExpenseCategory("Some Random Text")).toBe(null);
});

test("expenseInputSchema accepts a valid entry", () => {
  const result = expenseInputSchema.safeParse({
    title: "Coffee",
    amount: 25000,
    currency: "IDR",
    date: "2026-08-21",
    note: null,
  });
  expect(result.success).toBe(true);
});

test("expenseInputSchema rejects an empty title and negative amount", () => {
  const result = expenseInputSchema.safeParse({
    title: "",
    amount: -10,
    currency: "IDR",
    date: "2026-08-21",
  });
  expect(result.success).toBe(false);
});

test("readAll returns [] when nothing is stored", () => {
  expect(readAll()).toEqual([]);
});

test("writeAll then readAll round-trips a valid expense", () => {
  const expense = expenseSchema.parse({
    id: "1",
    source: "manual",
    title: "Taxi",
    amount: 40000,
    currency: "IDR",
    date: "2026-08-21",
    note: null,
    createdAt: new Date().toISOString(),
  });
  writeAll([expense]);
  expect(readAll()).toEqual([expense]);
});

test("writeAll then readAll round-trips receiptDetail.items intact (the actual save-then-reload path)", () => {
  const expense = expenseSchema.parse({
    id: "1",
    source: "scan",
    title: "Lunch at Solaria on 10:26am",
    amount: 152000,
    currency: "IDR",
    date: "2022-11-13",
    note: "5 items",
    createdAt: new Date().toISOString(),
    receiptDetail: {
      time: "10:26:06",
      receiptNumber: "045RC2112022/01054",
      merchantName: "SOLARIA",
      merchantAddress: null,
      merchantPhone: null,
      items: [
        { name: "Nasi + Ayam Katsu Teriyaki Saos", quantity: 1, unitPrice: 34546, total: 34546 },
        { name: "Nasi Goreng", quantity: 1, unitPrice: 30001, total: 30001 },
      ],
      subtotal: 138186,
      tax: 13819,
      discount: null,
      serviceCharge: null,
      paymentMethod: "Cash",
      cashReceived: 200000,
      change: 48000,
    },
  });

  writeAll([expense]);
  const reloaded = readAll();

  expect(reloaded).toEqual([expense]);
  expect(reloaded[0].receiptDetail?.items).toHaveLength(2);
  expect(reloaded[0].receiptDetail?.items[0].name).toBe("Nasi + Ayam Katsu Teriyaki Saos");
});

test("readAll falls back to [] on corrupt/foreign localStorage data", () => {
  localStorage.setItem("expense-notes.expenses.v1", "not json");
  expect(readAll()).toEqual([]);

  localStorage.setItem("expense-notes.expenses.v1", JSON.stringify([{ unrelated: true }]));
  expect(readAll()).toEqual([]);
});

test("receiptToExpenseInput prefers the suggested title over the merchant name", () => {
  const input = receiptToExpenseInput({
    merchant: { name: "ALFAMART", address: null, phone: null },
    transaction: { date: "2024-03-14", time: "09:05", receipt_number: "887712" },
    items: [
      { name: "SUSU ULTRA 250ML", quantity: 4, unit_price: 4500, discount: null, total: 18000 },
    ],
    subtotal: 18000,
    tax: 0,
    discount: 0,
    service_charge: null,
    total: 18000,
    payment: { method: "DEBIT BCA", amount: 18000 },
    metadata: { currency: "IDR", confidence: 0.9, validation_warning: null },
    suggested_title: "Breakfast at ALFAMART on 09:05am",
  });

  expect(input.title).toBe("Breakfast at ALFAMART on 09:05am");
  expect(input.amount).toBe(18000);
  expect(input.date).toBe("2024-03-14");
  expect(input.note).toBe("1 item");
  expect(input.receiptDetail).toEqual({
    time: "09:05",
    receiptNumber: "887712",
    merchantName: "ALFAMART",
    merchantAddress: null,
    merchantPhone: null,
    items: [{ name: "SUSU ULTRA 250ML", quantity: 4, unitPrice: 4500, total: 18000 }],
    subtotal: 18000,
    tax: 0,
    discount: 0,
    serviceCharge: null,
    total: 18000,
    paymentMethod: "DEBIT BCA",
    cashReceived: null,
    change: null,
  });
});

test("receiptToExpenseInput captures cash received and change when present", () => {
  const input = receiptToExpenseInput({
    merchant: { name: "Solaria", address: null, phone: null },
    transaction: { date: "2022-11-13", time: "10:26", receipt_number: null },
    items: [],
    subtotal: null,
    tax: null,
    discount: null,
    service_charge: null,
    total: 152000,
    payment: { method: "Cash", amount: 152000, cash_received: 200000, change: 48000 },
    metadata: { currency: "IDR", confidence: 0.9 },
    suggested_title: null,
  });

  expect(input.receiptDetail?.cashReceived).toBe(200000);
  expect(input.receiptDetail?.change).toBe(48000);
});

test("receiptToExpenseInput falls back to the merchant name when there's no suggested title", () => {
  const input = receiptToExpenseInput({
    merchant: { name: "ALFAMART", address: null, phone: null },
    transaction: { date: "2024-03-14", time: null, receipt_number: null },
    items: [],
    subtotal: null,
    tax: null,
    discount: null,
    service_charge: null,
    total: null,
    payment: { method: null, amount: null },
    metadata: { currency: null, confidence: null, validation_warning: null },
    suggested_title: null,
  });

  expect(input.title).toBe("ALFAMART");
});

// updateExpense (in expense.store.ts) is a thin `prev.map(...) + writeAll`
// wrapper around this same persistence layer — no React render harness in
// this repo to exercise the hook directly, so this covers the part that
// matters: a patched record round-trips through storage correctly.
test("writeAll of a patched expense round-trips the change", () => {
  const expense = expenseSchema.parse({
    id: "1",
    source: "manual",
    title: "Taxi",
    amount: 40000,
    currency: "IDR",
    date: "2026-08-21",
    note: null,
    createdAt: new Date().toISOString(),
  });
  writeAll([expense]);

  const updated = { ...expense, title: "Taxi home" };
  writeAll([updated]);

  expect(readAll()[0].title).toBe("Taxi home");
});

// Voice reuses the exact same Receipt shape as scan (see BE's
// ai/prompt.ts EXPENSE_SYSTEM_PROMPT) — receiptToExpenseInput now covers
// both entry points, no separate voiceToExpenseInput. These cover the
// voice-typical case: most receipt-only fields (address/phone/
// receipt_number/cash_received/change/tax/discount/service_charge) stay
// null, since a plain spoken sentence rarely states them.
test("receiptToExpenseInput handles a voice-sourced Receipt cleanly (mostly-null receipt-only fields)", () => {
  const input = receiptToExpenseInput(
    {
      merchant: { name: null, address: null, phone: null },
      transaction: { date: "2026-08-21", time: null, receipt_number: null },
      items: [],
      subtotal: null,
      tax: null,
      discount: null,
      service_charge: null,
      total: 50000,
      payment: { method: "cash", amount: 50000, cash_received: null, change: null },
      metadata: { currency: "IDR", confidence: 0.8, category: "other", validation_warning: null },
      suggested_title: null,
    },
    null,
    "Expense", // VoiceEntry's fallback — no merchant/suggested_title here, "Receipt" would read oddly for a taxi ride
  );

  expect(input.title).toBe("Expense");
  expect(input.amount).toBe(50000);
  expect(input.currency).toBe("IDR");
  expect(input.receiptDetail).not.toBeNull();
  expect(input.receiptDetail?.items).toEqual([]);
  expect(input.receiptDetail?.merchantName).toBeNull();
  expect(input.category).toBe("other");
});

test("receiptToExpenseInput populates receiptDetail.items and merchantName for a voice-sourced itemized Receipt", () => {
  const input = receiptToExpenseInput(
    {
      merchant: { name: "Point Cafe", address: null, phone: null },
      transaction: { date: "2026-08-26", time: null, receipt_number: null },
      items: [
        { name: "Coffee latte", quantity: 1, unit_price: 10000, discount: null, total: 10000 },
      ],
      subtotal: 10000,
      tax: null,
      discount: null,
      service_charge: null,
      total: 10000,
      payment: { method: "cash", amount: 10000, cash_received: null, change: null },
      metadata: {
        currency: "IDR",
        confidence: 0.9,
        category: "food_snack",
        validation_warning: null,
      },
      suggested_title: "Expense: Point Cafe",
    },
    null,
    "Expense",
  );

  expect(input.receiptDetail?.items).toEqual([
    { name: "Coffee latte", quantity: 1, unitPrice: 10000, total: 10000 },
  ]);
  expect(input.receiptDetail?.merchantName).toBe("Point Cafe");
  expect(input.title).toBe("Expense: Point Cafe");
  expect(input.category).toBe("food_snack");
});

test("receiptToExpenseInput defaults to food_snack when the model couldn't classify", () => {
  const input = receiptToExpenseInput({
    merchant: { name: "ALFAMART", address: null, phone: null },
    transaction: { date: "2024-03-14", time: null, receipt_number: null },
    items: [],
    subtotal: null,
    tax: null,
    discount: null,
    service_charge: null,
    total: null,
    payment: { method: null, amount: null },
    metadata: { currency: null, confidence: null, category: null, validation_warning: null },
    suggested_title: null,
  });

  expect(input.category).toBe("food_snack");
});

test("computeItemTotal multiplies quantity by unit price", () => {
  expect(computeItemTotal({ name: "Kopi", quantity: 2, unitPrice: 15000, total: 999 })).toBe(30000);
});

test("computeItemTotal is null when quantity or unit price is missing", () => {
  expect(
    computeItemTotal({ name: "Kopi", quantity: null, unitPrice: 15000, total: null }),
  ).toBeNull();
  expect(computeItemTotal({ name: "Kopi", quantity: 1, unitPrice: null, total: null })).toBeNull();
});

test("computeExpenseTotals sums item totals into a subtotal, then applies tax/discount/service charge", () => {
  const result = computeExpenseTotals({
    time: null,
    receiptNumber: null,
    merchantName: null,
    merchantAddress: null,
    merchantPhone: null,
    items: [
      { name: "Kopi", quantity: 1, unitPrice: 15000, total: 0 },
      { name: "Roti", quantity: 1, unitPrice: 12000, total: 0 },
    ],
    subtotal: 0,
    tax: 2700,
    discount: 1000,
    serviceCharge: 0,
    paymentMethod: null,
    cashReceived: null,
    change: null,
  });

  expect(result.subtotal).toBe(27000);
  expect(result.total).toBe(28700); // 27000 - 1000 + 2700 + 0
});

test("computeExpenseTotals trusts detail.total over the subtotal+tax formula — tax-inclusive pricing", () => {
  // Regression: a receipt printing "all prices inclusive tax" (tax is
  // informational, already inside item prices) used to get its real
  // printed total silently overridden by subtotal+tax, inflating it.
  const result = computeExpenseTotals({
    time: null,
    receiptNumber: null,
    merchantName: null,
    merchantAddress: null,
    merchantPhone: null,
    items: [
      { name: "Strawberry Americano", quantity: 1, unitPrice: 19000, total: 19000 },
      { name: "Matcha Jasmine Milk Tea", quantity: 1, unitPrice: 29000, total: 29000 },
    ],
    subtotal: 29000,
    tax: 4364,
    discount: null,
    serviceCharge: null,
    total: 48000,
    paymentMethod: null,
    cashReceived: null,
    change: null,
  });

  // Item totals sum to 48000 too here (matches the real receipt this is
  // based on) — the bug this guards against was total coming out 52364
  // (48000 + the 4364 tax), not a wrong subtotal.
  expect(result.total).toBe(48000);
  expect(result.subtotal).toBe(48000);
});

test("computeExpenseTotals is null (not zero) when there are no items to derive from", () => {
  const result = computeExpenseTotals({
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
    paymentMethod: null,
    cashReceived: null,
    change: null,
  });

  expect(result.subtotal).toBeNull();
  expect(result.total).toBeNull();
});

test("computeExpenseTotals is null when any item is missing quantity or unit price", () => {
  const result = computeExpenseTotals({
    time: null,
    receiptNumber: null,
    merchantName: null,
    merchantAddress: null,
    merchantPhone: null,
    items: [{ name: "Kopi", quantity: null, unitPrice: 15000, total: null }],
    subtotal: null,
    tax: null,
    discount: null,
    serviceCharge: null,
    paymentMethod: null,
    cashReceived: null,
    change: null,
  });

  expect(result.subtotal).toBeNull();
  expect(result.total).toBeNull();
});
