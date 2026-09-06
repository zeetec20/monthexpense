import { describe, it, expect } from "vitest";
import { parseReceipt } from "../../src/services/receipt-parser";
import { createFakeReceiptModel } from "../../src/ai/fake-model";

const VALID_JSON = JSON.stringify({
  merchant: { name: "Aqua Mart", address: null, phone: null },
  transaction: { date: "2024-03-14", time: "18:22", receipt_number: null },
  items: [{ name: "Aqua", quantity: 2, unit_price: 4000, discount: null, total: 8000 }],
  subtotal: 8000,
  tax: null,
  discount: null,
  service_charge: null,
  total: 8000,
  payment: { amount: null },
  metadata: { currency: "IDR", confidence: 0.9 },
});

describe("parseReceipt", () => {
  it("returns a validated receipt on first-try valid output", async () => {
    const model = createFakeReceiptModel();
    model.parseImpl = async () => VALID_JSON;

    const receipt = await parseReceipt(model, 1, "some ocr text");
    expect(receipt.merchant.name).toBe("Aqua Mart");
    expect(receipt.items).toHaveLength(1);
    expect(receipt.suggested_title).toBe("Dinner at Aqua Mart on 06:22pm");
    expect(receipt.metadata.validation_warning).toBeNull();
  });

  it("flags a receipt whose item totals don't add up to its printed subtotal", async () => {
    const model = createFakeReceiptModel();
    model.parseImpl = async () =>
      JSON.stringify({
        merchant: { name: "Aqua Mart", address: null, phone: null },
        transaction: { date: "2024-03-14", time: null, receipt_number: null },
        items: [{ name: "Aqua", quantity: 1, unit_price: 4000, discount: null, total: 4000 }],
        subtotal: 50000,
        tax: null,
        discount: null,
        service_charge: null,
        total: 50000,
        payment: { amount: null },
        metadata: { currency: "IDR", confidence: 0.9 },
      });

    const receipt = await parseReceipt(model, 1, "some ocr text");
    expect(receipt.metadata.validation_warning?.en).toMatch(/item may be missing/);
  });

  it("uses the model-picked category to phrase the suggested title", async () => {
    const model = createFakeReceiptModel();
    model.parseImpl = async () =>
      JSON.stringify({
        merchant: { name: "Indomaret", address: null, phone: null },
        transaction: { date: "2024-03-14", time: "16:04", receipt_number: null },
        items: [],
        subtotal: null,
        tax: null,
        discount: null,
        service_charge: null,
        total: null,
        payment: { amount: null },
        metadata: { currency: "IDR", confidence: 0.9, category: "grocery" },
      });

    const receipt = await parseReceipt(model, 1, "some ocr text");
    expect(receipt.suggested_title).toBe("Groceries at Indomaret on 04:04pm");
  });

  it("flags cash received minus change not matching the printed total", async () => {
    const model = createFakeReceiptModel();
    model.parseImpl = async () =>
      JSON.stringify({
        merchant: { name: "Solaria", address: null, phone: null },
        transaction: { date: "2022-11-13", time: "10:26", receipt_number: null },
        items: [],
        subtotal: null,
        tax: null,
        discount: null,
        service_charge: null,
        total: 152000,
        payment: { method: "cash", amount: 152000, cash_received: 200000, change: 10000 },
        metadata: { currency: "IDR", confidence: 0.9 },
      });

    const receipt = await parseReceipt(model, 1, "some ocr text");
    expect(receipt.metadata.validation_warning?.en).toMatch(/Cash received minus change/);
  });

  it("repairs once when the first output is invalid, then succeeds", async () => {
    let calls = 0;
    const model = createFakeReceiptModel();
    model.parseImpl = async () => {
      calls++;
      return "not json at all";
    };
    model.repairImpl = async () => VALID_JSON;

    const receipt = await parseReceipt(model, 1, "some ocr text");
    expect(calls).toBe(1);
    expect(receipt.total).toBe(8000);
  });

  it("strips markdown fences before validation", async () => {
    const model = createFakeReceiptModel();
    model.parseImpl = async () => "```json\n" + VALID_JSON + "\n```";

    const receipt = await parseReceipt(model, 1, "some ocr text");
    expect(receipt.merchant.name).toBe("Aqua Mart");
  });

  it("throws InvalidModelOutputError when repair attempts are exhausted", async () => {
    const model = createFakeReceiptModel();
    model.parseImpl = async () => "still not json";
    model.repairImpl = async () => "still not json either";

    await expect(parseReceipt(model, 1, "some ocr text")).rejects.toThrow(/could not be parsed/);
  });

  it("does not call repair when maxRepairAttempts is 0", async () => {
    let repairCalls = 0;
    const model = createFakeReceiptModel();
    model.parseImpl = async () => "invalid";
    model.repairImpl = async () => {
      repairCalls++;
      return VALID_JSON;
    };

    await expect(parseReceipt(model, 0, "x")).rejects.toThrow(/could not be parsed/);
    expect(repairCalls).toBe(0);
  });
});
