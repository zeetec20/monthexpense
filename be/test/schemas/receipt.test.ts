import { describe, it, expect } from "vitest";
import { ReceiptSchema } from "../../src/schemas/receipt";

const validReceipt = {
  merchant: { name: "Indomaret", address: null, phone: null },
  transaction: { date: "2024-03-14", time: "18:22", receipt_number: "0912345678" },
  items: [{ name: "Aqua 600ml", quantity: 2, unit_price: 4000, discount: null, total: 8000 }],
  subtotal: 8000,
  tax: 880,
  discount: null,
  service_charge: null,
  total: 8880,
  payment: { method: "cash", amount: 10000, cash_received: 10000, change: 1120 },
  metadata: { currency: "IDR", confidence: 0.9 },
  suggested_title: "Lunch at Indomaret on 06:22pm",
  // (metadata.validation_warning omitted here deliberately — covered by the
  // "defaults ... to null when omitted" tests below.)
};

describe("ReceiptSchema", () => {
  it("accepts a fully populated valid receipt", () => {
    expect(ReceiptSchema.safeParse(validReceipt).success).toBe(true);
  });

  it("defaults items to [] when omitted", () => {
    const { items, ...rest } = validReceipt;
    const result = ReceiptSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.items).toEqual([]);
  });

  it("accepts null for every nullable field (missing info -> null, never invented)", () => {
    const allNull = {
      merchant: { name: null, address: null, phone: null },
      transaction: { date: null, time: null, receipt_number: null },
      items: [],
      subtotal: null,
      tax: null,
      discount: null,
      service_charge: null,
      total: null,
      // method omitted deliberately — it's not nullable, defaults to "cash"
      // when absent instead (covered below).
      payment: { amount: null, cash_received: null, change: null },
      metadata: { currency: null, confidence: null, category: null, validation_warning: null },
      suggested_title: null,
    };
    expect(ReceiptSchema.safeParse(allNull).success).toBe(true);
  });

  it("defaults payment.method to \"cash\" when omitted, rejects a method outside the enum", () => {
    const { payment, ...rest } = validReceipt;
    const { method, ...paymentRest } = payment;
    const result = ReceiptSchema.safeParse({ ...rest, payment: paymentRest });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.payment.method).toBe("cash");

    const invalid = { ...validReceipt, payment: { ...validReceipt.payment, method: "credit card" } };
    expect(ReceiptSchema.safeParse(invalid).success).toBe(false);
  });

  it("defaults suggested_title to null when omitted", () => {
    const { suggested_title, ...rest } = validReceipt;
    const result = ReceiptSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.suggested_title).toBeNull();
  });

  it("defaults metadata.validation_warning to null when omitted", () => {
    const result = ReceiptSchema.safeParse(validReceipt);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.metadata.validation_warning).toBeNull();
  });

  it("defaults metadata.category to null when omitted, rejects an unrecognized category", () => {
    const result = ReceiptSchema.safeParse(validReceipt);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.metadata.category).toBeNull();

    const invalid = { ...validReceipt, metadata: { currency: "IDR", confidence: 0.9, category: "furniture" } };
    expect(ReceiptSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects a string where a monetary number is required", () => {
    const invalid = { ...validReceipt, total: "8880" };
    expect(ReceiptSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects confidence outside [0,1]", () => {
    const invalid = { ...validReceipt, metadata: { currency: "IDR", confidence: 1.5 } };
    expect(ReceiptSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects a missing required object key (e.g. merchant)", () => {
    const { merchant, ...rest } = validReceipt;
    expect(ReceiptSchema.safeParse(rest).success).toBe(false);
  });
});
