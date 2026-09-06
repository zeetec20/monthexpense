import { describe, it, expect } from "vitest";
import { normalizeOcrText, normalizeReceiptCandidate } from "../../src/parser/normalize";

describe("normalizeOcrText", () => {
  it("normalizes CRLF to LF", () => {
    expect(normalizeOcrText("a\r\nb")).toBe("a\nb");
  });

  it("collapses 3+ blank lines to one", () => {
    expect(normalizeOcrText("a\n\n\n\nb")).toBe("a\n\nb");
  });

  it("trims trailing whitespace per line but preserves leading (column) whitespace", () => {
    const input = "ITEM   QTY   PRICE   \n  AQUA  2  4000  ";
    expect(normalizeOcrText(input)).toBe("ITEM   QTY   PRICE\n  AQUA  2  4000");
  });

  it("trims overall leading/trailing whitespace", () => {
    expect(normalizeOcrText("\n\n  hello  \n\n")).toBe("hello");
  });
});

describe("normalizeReceiptCandidate", () => {
  it("recomputes a literal total of 0 from subtotal — never a real free purchase, and never adds tax back on (this app's receipts are predominantly tax-inclusive)", () => {
    const result = normalizeReceiptCandidate({
      subtotal: "29000",
      tax: "4364",
      discount: null,
      service_charge: null,
      total: 0,
      items: [],
    }) as Record<string, unknown>;
    expect(result.total).toBe(29000);
    // Not silently nulled — we can't be sure tax is informational just
    // because the printed total was garbled to 0 (unlike a normally-
    // printed total that already reconciles). Left populated so
    // checkArithmetic's own subtotal+tax/total reconciliation check can
    // flag the mismatch for the user, instead of guessing on their behalf.
    expect(result.tax).toBe(4364);
  });

  it("leaves a non-zero total untouched even when subtotal is present", () => {
    // tax non-zero and total already the subtotal+tax sum — keeps this
    // clear of the separate tax-ambiguity/structural-equality guards
    // below, which would otherwise legitimately move a *different*-looking
    // total for reasons unrelated to the one under test here.
    const result = normalizeReceiptCandidate({
      subtotal: "29000",
      tax: "4364",
      discount: null,
      service_charge: null,
      total: 33364,
      items: [],
    }) as Record<string, unknown>;
    expect(result.total).toBe(33364);
  });

  it("coerces money-like strings to numbers", () => {
    const result = normalizeReceiptCandidate({
      subtotal: "Rp4,000",
      tax: "500",
      discount: null,
      service_charge: null,
      total: 4500,
      items: [],
    }) as Record<string, unknown>;
    expect(result.subtotal).toBe(4000);
    expect(result.tax).toBe(500);
    expect(result.total).toBe(4500);
  });

  it("reads Indonesian dot-thousands amounts as thousands, not decimals (real money never has 3 fractional digits)", () => {
    // subtotal/total asserted via separate calls — with both in one call and
    // tax/discount/service absent, the total<->subtotal structural-equality
    // correction (see below) would "fix" this test's intentionally-unrelated
    // total value right back down to the subtotal value.
    const subtotalResult = normalizeReceiptCandidate({
      subtotal: "90.000",
      tax: null,
      discount: null,
      service_charge: null,
      total: null,
      items: [],
    }) as Record<string, unknown>;
    expect(subtotalResult.subtotal).toBe(90000);

    const totalResult = normalizeReceiptCandidate({
      subtotal: null,
      tax: null,
      discount: null,
      service_charge: null,
      total: "1.234.567",
      items: [],
    }) as Record<string, unknown>;
    expect(totalResult.total).toBe(1234567);
  });

  it("still reads a lone dot as a decimal point when it doesn't look like thousands-grouping", () => {
    const result = normalizeReceiptCandidate({
      subtotal: "26.5",
      tax: null,
      discount: null,
      service_charge: null,
      total: "26.00",
      items: [],
    }) as Record<string, unknown>;
    expect(result.subtotal).toBe(26.5);
    expect(result.total).toBe(26);
  });

  it("resolves magnitude shorthand (k/rb/ribu/jt/juta) a typed casual note might use", () => {
    // subtotal/total asserted via separate calls — see the dot-thousands
    // test above for why (the total<->subtotal structural-equality
    // correction would otherwise "fix" an intentionally-unrelated total
    // right back down to the subtotal).
    const subtotalResult = normalizeReceiptCandidate({
      subtotal: "75k",
      tax: null,
      discount: null,
      service_charge: null,
      total: null,
      items: [],
    }) as Record<string, unknown>;
    expect(subtotalResult.subtotal).toBe(75000);

    const totalResult = normalizeReceiptCandidate({
      subtotal: null,
      tax: null,
      discount: null,
      service_charge: null,
      total: "1.5jt",
      items: [],
    }) as Record<string, unknown>;
    expect(totalResult.total).toBe(1_500_000);

    const rbResult = normalizeReceiptCandidate({
      subtotal: "5 ribu",
      tax: null,
      discount: null,
      service_charge: null,
      total: "5rb",
      items: [],
    }) as Record<string, unknown>;
    expect(rbResult.subtotal).toBe(5000);
    expect(rbResult.total).toBe(5000);
  });

  it("defaults items to [] when missing", () => {
    const result = normalizeReceiptCandidate({}) as Record<string, unknown>;
    expect(result.items).toEqual([]);
  });

  it("coerces item numeric fields", () => {
    const result = normalizeReceiptCandidate({
      items: [{ name: "Aqua", quantity: "2", unit_price: "4,000", discount: null, total: "8000" }],
    }) as { items: Array<Record<string, unknown>> };
    expect(result.items[0]).toEqual({ name: "Aqua", quantity: 2, unit_price: 4000, discount: null, total: 8000 });
  });

  it("normalizes DD/MM/YYYY dates to ISO", () => {
    const result = normalizeReceiptCandidate({
      transaction: { date: "14/03/2024", time: "18:22", receipt_number: "123" },
    }) as { transaction: Record<string, unknown> };
    expect(result.transaction.date).toBe("2024-03-14");
  });

  it("leaves unparseable dates as null", () => {
    const result = normalizeReceiptCandidate({
      transaction: { date: "not a date", time: null, receipt_number: null },
    }) as { transaction: Record<string, unknown> };
    expect(result.transaction.date).toBeNull();
  });

  it("standardizes currency symbols to ISO codes", () => {
    const result = normalizeReceiptCandidate({
      metadata: { currency: "Rp", confidence: 0.9 },
    }) as { metadata: Record<string, unknown> };
    expect(result.metadata.currency).toBe("IDR");
  });

  it("passes through non-object input untouched", () => {
    expect(normalizeReceiptCandidate("not an object")).toBe("not an object");
    expect(normalizeReceiptCandidate(null)).toBeNull();
  });

  it("defaults item quantity to 1 when a price is given without a quantity, and derives total", () => {
    const result = normalizeReceiptCandidate({
      items: [{ name: "Nasi Goreng", quantity: null, unit_price: 30001, discount: null, total: null }],
    }) as { items: Array<Record<string, unknown>> };
    expect(result.items[0]).toEqual({
      name: "Nasi Goreng",
      quantity: 1,
      unit_price: 30001,
      discount: null,
      total: 30001,
    });
  });

  it("computes subtotal from item totals when the model left it null", () => {
    const result = normalizeReceiptCandidate({
      subtotal: null,
      items: [
        { name: "Item A", quantity: 1, unit_price: 1000, discount: null, total: 1000 },
        { name: "Item B", quantity: 1, unit_price: 2000, discount: null, total: 2000 },
      ],
    }) as Record<string, unknown>;
    expect(result.subtotal).toBe(3000);
  });

  it("leaves subtotal null if any item total is still unknown", () => {
    const result = normalizeReceiptCandidate({
      subtotal: null,
      items: [{ name: "A", quantity: null, unit_price: null, discount: null, total: null }],
    }) as Record<string, unknown>;
    expect(result.subtotal).toBeNull();
  });

  it("nulls out tax when subtotal minus discount already equals total without it (tax-inclusive receipt)", () => {
    // Indomaret-shaped: prices already include PPN, model extracted the
    // informational DPP value (7273) as "tax" — but 70500 - 12000 already
    // equals the printed total (58500) with nothing added, so it's not real.
    const result = normalizeReceiptCandidate({
      subtotal: 70500,
      tax: 7273,
      discount: 12000,
      service_charge: 0,
      total: 58500,
      items: [],
    }) as Record<string, unknown>;
    expect(result.tax).toBeNull();
  });

  it("nulls tax even when subtotal/discount extraction is noisy, as long as dropping tax is the closer fit", () => {
    // Real retest payload: subtotal off by 450 (70050 vs true 70500), discount
    // off by 3000 (15000 vs true 12000), service_charge left null (correctly —
    // none printed). Without tax: |58500-55050|=3450. With tax: |58500-62323|=3823.
    // Without-tax is closer -> null, despite neither other field being exact.
    const result = normalizeReceiptCandidate({
      subtotal: 70050,
      tax: 7273,
      discount: 15000,
      service_charge: null,
      total: 58500,
      items: [],
    }) as Record<string, unknown>;
    expect(result.tax).toBeNull();
    // discount re-derived from subtotal-total instead of trusting the
    // model's mis-summed 15000 — inherits the small subtotal typo (70050 vs
    // real 70500) but still lands far closer to the real 12000.
    expect(result.discount).toBe(11550);
  });

  it("re-derives discount from subtotal/total when tax nulls out, overriding the model's mis-summed voucher total", () => {
    // Clean subtotal this time -> derived discount is exact.
    const result = normalizeReceiptCandidate({
      subtotal: 70500,
      tax: 7273,
      discount: 15000,
      service_charge: 0,
      total: 58500,
      items: [],
    }) as Record<string, unknown>;
    expect(result.tax).toBeNull();
    expect(result.discount).toBe(12000);
  });

  it("nulls tax when service_charge is null (not printed) rather than blocking the check", () => {
    const result = normalizeReceiptCandidate({
      subtotal: 70500,
      tax: 7273,
      discount: 12000,
      service_charge: null,
      total: 58500,
      items: [],
    }) as Record<string, unknown>;
    expect(result.tax).toBeNull();
  });

  it("keeps tax when it's genuinely needed to reconcile subtotal to total (additive tax), and leaves discount untouched", () => {
    // Solaria-shaped: subtotal + tax (rounded) = total, tax is a real add-on.
    // discount deliberately non-zero here to prove the derive-discount branch
    // (only reachable when tax nulls out) doesn't fire and overwrite it.
    const result = normalizeReceiptCandidate({
      subtotal: 138186,
      tax: 13819,
      discount: 5,
      service_charge: 0,
      total: 152000,
      items: [],
    }) as Record<string, unknown>;
    expect(result.tax).toBe(13819);
    expect(result.discount).toBe(5);
  });

  it("nulls merchant.name when the model picked an item name instead of the store", () => {
    const result = normalizeReceiptCandidate({
      merchant: { name: "IDM RAMOS SUPER 5KG", address: null, phone: null },
      items: [
        { name: "IDM RAMOS SUPER 5KG", quantity: 1, unit_price: 62500, discount: null, total: 62500 },
        { name: "IDM UFO MIE GR IND88", quantity: 1, unit_price: 8000, discount: null, total: 8000 },
      ],
    }) as { merchant: Record<string, unknown> };
    expect(result.merchant.name).toBeNull();
  });

  it("leaves merchant.name alone when it's a real store name, not an item", () => {
    const result = normalizeReceiptCandidate({
      merchant: { name: "Indomaret", address: null, phone: null },
      items: [{ name: "IDM RAMOS SUPER 5KG", quantity: 1, unit_price: 62500, discount: null, total: 62500 }],
    }) as { merchant: Record<string, unknown> };
    expect(result.merchant.name).toBe("Indomaret");
  });

  it("corrects total when the model summed subtotal + cash + change together instead of reading the Total line", () => {
    // Real bug: Total 25.000, Tunai 55.000, Keubali 30.000 -> model output
    // total 110000 (= 25000+55000+30000). subtotal and cash-minus-change both
    // independently agree on 25000, so total gets corrected to that — and
    // payment.amount (same wrong 110000) follows it, since this schema has
    // no split-payment concept — the two are always meant to be the same number.
    const result = normalizeReceiptCandidate({
      subtotal: 25000,
      tax: null,
      discount: null,
      service_charge: null,
      total: 110000,
      items: [{ name: "TRASHBAG", quantity: 1, unit_price: 25000, discount: null, total: 25000 }],
      payment: { method: "cash", amount: 110000, cash_received: 55000, change: 30000 },
    }) as { total: unknown; payment: Record<string, unknown> };
    expect(result.total).toBe(25000);
    expect(result.payment.amount).toBe(25000);
  });

  it("leaves total alone when cash/change disagrees with it but there's no subtotal to corroborate", () => {
    const result = normalizeReceiptCandidate({
      subtotal: null,
      total: 110000,
      items: [],
      payment: { method: "cash", amount: 110000, cash_received: 55000, change: 30000 },
    }) as Record<string, unknown>;
    expect(result.total).toBe(110000);
  });

  it("nulls payment.change when there's no cash_received — QRIS/bank-transfer payments can't have genuine cash change", () => {
    // Real bug: a QRIS-paid receipt printed a "Change" line (POS template
    // artifact/OCR noise, no cash was ever tendered) and the model copied
    // it as payment.change: 48000, alongside the real total.
    const result = normalizeReceiptCandidate({
      subtotal: 48000,
      total: 48000,
      items: [
        { name: "Strawberry Americano", quantity: 1, unit_price: 19000, discount: null, total: 19000 },
        { name: "Matcha Jasmine Milk Tea", quantity: 1, unit_price: 29000, discount: null, total: 29000 },
      ],
      payment: { method: "qris", amount: 48000, cash_received: null, change: 48000 },
    }) as { payment: Record<string, unknown> };
    expect(result.payment.change).toBeNull();
  });

  it("keeps payment.change when cash_received is genuinely present", () => {
    const result = normalizeReceiptCandidate({
      subtotal: 15000,
      total: 15000,
      items: [{ name: "Kopi", quantity: 1, unit_price: 15000, discount: null, total: 15000 }],
      payment: { method: "cash", amount: 15000, cash_received: 20000, change: 5000 },
    }) as { payment: Record<string, unknown> };
    expect(result.payment.change).toBe(5000);
  });

  it("syncs payment.amount to total even when the total-correction branch itself doesn't fire", () => {
    // total is already trusted as-is here (no cash/subtotal mismatch) — but
    // payment.amount independently disagrees, so it still gets synced.
    const result = normalizeReceiptCandidate({
      subtotal: 25000,
      total: 25000,
      items: [{ name: "TRASHBAG", quantity: 1, unit_price: 25000, discount: null, total: 25000 }],
      payment: { method: "cash", amount: 999999, cash_received: null, change: null },
    }) as { payment: Record<string, unknown> };
    expect(result.payment.amount).toBe(25000);
  });

  it("corrects total to subtotal when tax/discount/service are all absent (nothing could explain a difference)", () => {
    // Real bug: OCR misread the printed Total line's leading digit (Rp90.000
    // -> "Rp20.000"). No PPN/discount/service lines on the receipt at all,
    // so total = subtotal is structurally required, not just usually true.
    const result = normalizeReceiptCandidate({
      subtotal: 90000,
      tax: null,
      discount: null,
      service_charge: null,
      total: 20000,
      items: [
        { name: "TROPICAL BRIZE", quantity: 1, unit_price: 26000, discount: null, total: 26000 },
        { name: "KARAAGE", quantity: 1, unit_price: 30000, discount: null, total: 30000 },
        { name: "MOZZARELLA STICKS", quantity: 1, unit_price: 27000, discount: null, total: 27000 },
        { name: "AIR MINERAL", quantity: 1, unit_price: 7000, discount: null, total: 7000 },
      ],
    }) as Record<string, unknown>;
    expect(result.total).toBe(90000);
  });

  it("doesn't touch total when tax is a real non-zero value (total genuinely differs from subtotal on purpose)", () => {
    const result = normalizeReceiptCandidate({
      subtotal: 138186,
      tax: 13819,
      discount: null,
      service_charge: null,
      total: 152000,
      items: [],
    }) as Record<string, unknown>;
    expect(result.total).toBe(152000);
  });

  // Item-junk filtering: shared with the voice path (see ai/prompt.ts's
  // EXPENSE_SYSTEM_PROMPT) — hallucinated items observed on voice transcripts
  // are just as invalid on a printed receipt, so the same filters apply here.
  it("drops items whose name is a schema field name echoed back, keeping real items", () => {
    const result = normalizeReceiptCandidate({
      items: [
        { name: "nasi goreng", quantity: 1, unit_price: null, total: 10000 },
        { name: "total", quantity: null, unit_price: null, total: 10000 },
        { name: "Note", quantity: null, unit_price: null, total: null },
        { name: "unit_price", quantity: null, unit_price: null, total: null },
        { name: "  Merchant  ", quantity: null, unit_price: null, total: null },
      ],
    }) as Record<string, unknown>;

    expect(result.items).toEqual([{ name: "nasi goreng", quantity: 1, unit_price: null, discount: null, total: 10000 }]);
  });

  it("drops an item named after a glued OCR quantity×price token (real report: SR'21 receipt)", () => {
    // "1PCxRp2.260" is the qty×price line the model mistakenly used as the
    // name of the item printed above it ("AMP 312 AT EXEC (10/100)") —
    // prompt.ts rule 14 is the real fix, this is the normalize.ts safety net.
    const result = normalizeReceiptCandidate({
      items: [
        { name: "1PCxRp2.260", quantity: 1, unit_price: 2260, total: 2280 },
        { name: "STOP MAP BIOLA KNG (50)", quantity: 3, unit_price: 2375, total: 7125 },
      ],
    }) as Record<string, unknown>;

    expect(result.items).toEqual([
      { name: "STOP MAP BIOLA KNG (50)", quantity: 3, unit_price: 2375, discount: null, total: 7125 },
    ]);
  });

  it("drops a word-by-word repetition-loop hallucination down to an empty array (real report)", () => {
    // Exact shape observed for "Beli kopi 1 Rp20.000 di Berkah Jaya." — a
    // single plain expense the model shredded into ~20 fake items:
    // connector words, the merchant name, repeated price/quantity tokens,
    // and duplicate (name, price) pairs.
    const result = normalizeReceiptCandidate({
      items: [
        { name: "Kopi", quantity: 1, unit_price: 20000, total: 20000 },
        { name: "Berkah Jaya", quantity: 1, unit_price: 0, total: 0 },
        { name: "Beli", quantity: 1, unit_price: 0, total: 0 },
        { name: "di", quantity: 1, unit_price: 0, total: 0 },
        { name: "Rp20.000", quantity: 1, unit_price: 20000, total: 20000 },
        { name: "hari ini", quantity: 1, unit_price: 0, total: 0 },
        { name: "kopi", quantity: 1, unit_price: 20000, total: 20000 },
        { name: "1", quantity: 1, unit_price: 20000, total: 20000 },
      ],
    }) as Record<string, unknown>;

    // Only the one real, non-duplicate item survives.
    expect(result.items).toEqual([{ name: "Kopi", quantity: 1, unit_price: 20000, discount: null, total: 20000 }]);
  });

  it("drops items priced exactly 0/0 (fabricated, never a genuine null-price item)", () => {
    const result = normalizeReceiptCandidate({
      items: [
        { name: "Parkir", quantity: 1, unit_price: 0, total: 0 },
        { name: "Bensin", quantity: 1, unit_price: 10000, total: 10000 },
      ],
    }) as Record<string, unknown>;

    expect(result.items).toEqual([{ name: "Bensin", quantity: 1, unit_price: 10000, discount: null, total: 10000 }]);
  });
});
