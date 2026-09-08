import { describe, it, expect } from "vitest";
import { checkArithmetic, checkVoiceCompleteness } from "../../src/parser/validate";
import type { Receipt } from "../../src/schemas/receipt";

const receipt = (overrides: Partial<Receipt> = {}): Receipt => {
  return {
    merchant: { name: "Solaria", address: null, phone: null },
    transaction: { date: "2022-11-13", time: "10:26", receipt_number: null },
    items: [],
    subtotal: null,
    tax: null,
    discount: null,
    service_charge: null,
    total: null,
    payment: { method: "cash", amount: null, cash_received: null, change: null },
    metadata: { currency: "IDR", confidence: 0.9, category: null, validation_warning: null },
    suggested_title: null,
    ...overrides,
  };
};

describe("checkArithmetic", () => {
  it("returns null when there's not enough data to check", () => {
    expect(checkArithmetic(receipt())).toBeNull();
  });

  it("returns null when item totals reconcile with the subtotal", () => {
    const r = receipt({
      items: [
        { name: "A", quantity: 1, unit_price: 1000, discount: null, total: 1000 },
        { name: "B", quantity: 1, unit_price: 2000, discount: null, total: 2000 },
      ],
      subtotal: 3000,
    });
    expect(checkArithmetic(r)).toBeNull();
  });

  it("flags a shortfall between item totals and the printed subtotal (likely missing item)", () => {
    const r = receipt({
      items: [{ name: "A", quantity: 1, unit_price: 1000, discount: null, total: 1000 }],
      subtotal: 5000,
    });
    expect(checkArithmetic(r)?.en).toMatch(/item may be missing/);
  });

  it("tolerates small rounding differences (e.g. a printed rounding adjustment)", () => {
    const r = receipt({
      items: [{ name: "A", quantity: 1, unit_price: 138186, discount: null, total: 138186 }],
      subtotal: 138186,
      tax: 13819,
      discount: 0,
      service_charge: 0,
      total: 152000, // 138186 + 13819 = 152005, receipt rounds -5 to 152000
    });
    expect(checkArithmetic(r)).toBeNull();
  });

  it("flags subtotal+tax-discount+service not matching the printed total", () => {
    const r = receipt({
      subtotal: 100000,
      tax: 10000,
      discount: 0,
      service_charge: 0,
      total: 999999,
    });
    expect(checkArithmetic(r)?.en).toMatch(/don't add up to the printed total/);
  });

  it("flags subtotal+tax not matching total even when discount/service_charge weren't printed at all (null, not 0)", () => {
    // Regression: this check used to require discount AND service_charge
    // to be non-null before running at all, so it silently never fired for
    // the common case of a receipt with neither printed — exactly the
    // scenario normalize.ts's total-recovered-from-zero path now
    // deliberately leaves tax populated for, relying on this check to
    // flag the mismatch instead of guessing.
    const r = receipt({
      subtotal: 48000,
      tax: 4364,
      discount: null,
      service_charge: null,
      total: 48000,
    });
    expect(checkArithmetic(r)?.en).toMatch(/don't add up to the printed total/);
  });

  it("flags an item whose quantity times unit price doesn't match its total", () => {
    const r = receipt({
      items: [{ name: "Aqua", quantity: 2, unit_price: 4000, discount: null, total: 50000 }],
    });
    expect(checkArithmetic(r)?.en).toMatch(/Aqua/);
  });

  it("returns null when cash received minus change matches the total", () => {
    const r = receipt({
      total: 152000,
      payment: { method: "cash", amount: 152000, cash_received: 200000, change: 48000 },
    });
    expect(checkArithmetic(r)).toBeNull();
  });

  it("flags cash received minus change not matching the printed total", () => {
    const r = receipt({
      total: 152000,
      payment: { method: "cash", amount: 152000, cash_received: 200000, change: 10000 },
    });
    expect(checkArithmetic(r)?.en).toMatch(/Cash received minus change/);
  });
});

const expenseVoice = (overrides: Partial<Receipt> = {}): Receipt => {
  return receipt({
    merchant: { name: "Point Cafe", address: null, phone: null },
    transaction: { date: "2026-08-26", time: null, receipt_number: null },
    items: [{ name: "Coffee latte", quantity: 1, unit_price: 10000, discount: null, total: 10000 }],
    total: 10000,
    ...overrides,
  });
};

describe("checkVoiceCompleteness", () => {
  it("returns null when total, items, and merchant are all clear", () => {
    expect(checkVoiceCompleteness(expenseVoice())).toBeNull();
  });

  it("returns null for a plain expense with no items and no merchant", () => {
    expect(
      checkVoiceCompleteness(
        expenseVoice({ items: [], merchant: { name: null, address: null, phone: null } }),
      ),
    ).toBeNull();
  });

  it("flags a null total", () => {
    expect(checkVoiceCompleteness(expenseVoice({ total: null }))?.en).toMatch(
      /amount wasn't clear/,
    );
  });

  it("flags an item with a null name or price", () => {
    expect(
      checkVoiceCompleteness(
        expenseVoice({
          items: [{ name: null, quantity: 1, unit_price: 10000, discount: null, total: 10000 }],
        }),
      )?.en,
    ).toMatch(/item's name or price wasn't clear/);
    expect(
      checkVoiceCompleteness(
        expenseVoice({
          items: [
            { name: "Coffee latte", quantity: 1, unit_price: null, discount: null, total: null },
          ],
        }),
      )?.en,
    ).toMatch(/item's name or price wasn't clear/);
  });

  it("flags a null merchant only when there are items to itemize", () => {
    expect(
      checkVoiceCompleteness(expenseVoice({ merchant: { name: null, address: null, phone: null } }))
        ?.en,
    ).toMatch(/store or brand name/);
    expect(
      checkVoiceCompleteness(
        expenseVoice({ items: [], merchant: { name: null, address: null, phone: null } }),
      ),
    ).toBeNull();
  });
});
