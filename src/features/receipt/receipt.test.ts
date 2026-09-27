import { test, expect } from "bun:test";
import { receiptSchema } from "./receipt.schema";

// Matches text-processing-slm/src/schemas/receipt.ts's "missing info -> null,
// never invented" contract — a real receipt commonly has an item or merchant
// name the model couldn't confidently read. Regression test for a bug where
// this client schema required these fields non-null and threw on exactly
// this (routine) shape, aborting the whole scan.
test("receiptSchema accepts null item fields and a null merchant name", () => {
  const result = receiptSchema.safeParse({
    merchant: { name: null, address: null, phone: null },
    transaction: { date: null, time: null, receipt_number: null },
    items: [{ name: null, quantity: null, unit_price: null, discount: null, total: null }],
    subtotal: null,
    tax: null,
    discount: null,
    service_charge: null,
    total: null,
    payment: { method: null, amount: null },
    metadata: { currency: null, confidence: null, validation_warning: null },
    suggested_title: null,
  });

  expect(result.success).toBe(true);
});

// Regression test: metadata.category was missing from this schema entirely
// until now — zod silently strips keys it doesn't know about, so the
// backend's category was parsed away on every single scan/voice response
// and never reached the client, even though the backend always sent it.
test("receiptSchema carries metadata.category through instead of silently dropping it", () => {
  const result = receiptSchema.parse({
    merchant: { name: "Warteg Bahagia", address: null, phone: null },
    transaction: { date: "2026-08-21", time: "12:30", receipt_number: null },
    items: [],
    subtotal: null,
    tax: null,
    discount: null,
    service_charge: null,
    total: 15000,
    payment: { method: "cash", amount: 15000 },
    metadata: { currency: "IDR", confidence: 0.9, category: "food_snack" },
    suggested_title: null,
  });

  expect(result.metadata.category).toBe("food_snack");
});

// Regression test: a deployed backend can lag behind this client (it
// hot-reloads instantly, the backend needs a manual `wrangler deploy`), so a
// field this client knows about can be entirely absent from a real response,
// not just explicitly null. Zod's .nullable() alone still requires the key
// to be present — this failed for real (`validation_warning: Required`)
// against a backend that predated that field.
test("receiptSchema accepts suggested_title and metadata.validation_warning being entirely absent", () => {
  const result = receiptSchema.safeParse({
    merchant: { name: "Solaria", address: null, phone: null },
    transaction: { date: "2022-11-13", time: "10:26", receipt_number: null },
    items: [],
    subtotal: null,
    tax: null,
    discount: null,
    service_charge: null,
    total: null,
    payment: { method: null, amount: null },
    metadata: { currency: "IDR", confidence: 0.9 },
    // suggested_title omitted entirely
  });

  expect(result.success).toBe(true);
});
