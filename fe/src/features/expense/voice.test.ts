import { test, expect, afterEach } from "bun:test";
import { parseVoiceExpense } from "./voice.api";

// Response shape acceptance is receipt.test.ts's job now — parseVoiceExpense
// reuses receiptResponseSchema wholesale (see voice.api.ts). This file only
// covers the HTTP-call behavior (request body, error handling).

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const RECEIPT_DATA = {
  merchant: { name: "Point Cafe", address: null, phone: null },
  transaction: { date: "2026-08-21", time: null, receipt_number: null },
  items: [],
  subtotal: null,
  tax: null,
  discount: null,
  service_charge: null,
  total: 50000,
  payment: { method: "cash", amount: 50000, cash_received: null, change: null },
  metadata: { currency: "IDR", confidence: 0.9, category: "dining", validation_warning: null },
  suggested_title: "Expense: Point Cafe",
};

test("parseVoiceExpense posts { text, referenceDate } and validates the response", async () => {
  let capturedBody: unknown;
  globalThis.fetch = (async (_url, init) => {
    capturedBody = JSON.parse((init as RequestInit).body as string);
    return new Response(JSON.stringify({ data: RECEIPT_DATA }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const result = await parseVoiceExpense("coffee 50k", "2026-08-21");

  expect(capturedBody).toEqual({ text: "coffee 50k", referenceDate: "2026-08-21" });
  expect(result.data.merchant.name).toBe("Point Cafe");
  expect(result.data.total).toBe(50000);
});

test("parseVoiceExpense includes language when given", async () => {
  let capturedBody: unknown;
  globalThis.fetch = (async (_url, init) => {
    capturedBody = JSON.parse((init as RequestInit).body as string);
    return new Response(JSON.stringify({ data: RECEIPT_DATA }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  await parseVoiceExpense("beli kopi", "2026-08-21", "id");

  expect(capturedBody).toEqual({ text: "beli kopi", referenceDate: "2026-08-21", language: "id" });
});

test("parseVoiceExpense throws on a non-ok response", async () => {
  globalThis.fetch = (async () => new Response("", { status: 500 })) as unknown as typeof fetch;
  await expect(parseVoiceExpense("coffee", "2026-08-21")).rejects.toThrow(/500/);
});

test("parseVoiceExpense rejects a response that fails schema validation", async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ data: { merchant: { name: "Coffee" } } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })) as unknown as typeof fetch;

  await expect(parseVoiceExpense("coffee", "2026-08-21")).rejects.toThrow();
});
