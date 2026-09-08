import { describe, it, expect } from "vitest";
import app from "../../src/index";
import { createFakeExpenseModel } from "../../src/ai/fake-model";
import { testCtx, authHeaders, envWithExpenseModel, buildTestEnv } from "./helpers";

// /v1/expenses/parse returns the exact same Receipt shape /v1/receipts/parse
// does — voice extracts the full structured expense, just from a spoken
// transcript instead of OCR text. See ai/prompt.ts's EXPENSE_SYSTEM_PROMPT.
const VALID_JSON = JSON.stringify({
  merchant: { name: "Starbucks", address: null, phone: null },
  transaction: { date: "2024-03-14", time: null, receipt_number: null },
  items: [{ name: "Coffee", quantity: 1, unit_price: "50000", discount: null, total: "50000" }],
  subtotal: "50000",
  tax: null,
  discount: null,
  service_charge: null,
  total: "50000",
  payment: { method: "cash", amount: "50000", cash_received: null, change: null },
  metadata: { currency: "IDR", confidence: 0.9, category: "food_snack" },
});

const post = (body: unknown, headers: Record<string, string> = authHeaders()) => {
  return new Request("http://localhost/v1/expenses/parse", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
};

describe("POST /v1/expenses/parse", () => {
  it("rejects requests without a valid API key", async () => {
    const res = await app.fetch(
      post(
        { text: "coffee 50k", referenceDate: "2024-03-14" },
        { "Content-Type": "application/json" },
      ),
      buildTestEnv(),
      testCtx,
    );
    expect(res.status).toBe(401);
  });

  it("rejects non-JSON content type", async () => {
    const res = await app.fetch(
      new Request("http://localhost/v1/expenses/parse", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "text/plain" },
        body: "hi",
      }),
      buildTestEnv(),
      testCtx,
    );
    expect(res.status).toBe(415);
  });

  it("rejects empty text", async () => {
    const res = await app.fetch(
      post({ text: "", referenceDate: "2024-03-14" }),
      buildTestEnv(),
      testCtx,
    );
    expect(res.status).toBe(400);
  });

  it("rejects a missing/malformed referenceDate", async () => {
    const res = await app.fetch(post({ text: "coffee 50k" }), buildTestEnv(), testCtx);
    expect(res.status).toBe(400);

    const res2 = await app.fetch(
      post({ text: "coffee 50k", referenceDate: "14-03-2024" }),
      buildTestEnv(),
      testCtx,
    );
    expect(res2.status).toBe(400);
  });

  it("returns a validated expense (Receipt shape) for valid model output", async () => {
    const model = createFakeExpenseModel();
    model.parseImpl = async () => VALID_JSON;
    const env = envWithExpenseModel(model);

    const res = await app.fetch(
      post({ text: "coffee 50k at starbucks", referenceDate: "2024-03-14" }),
      env,
      testCtx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { merchant: { name: string }; total: number; suggested_title: string | null };
    };
    expect(body.data.merchant.name).toBe("Starbucks");
    expect(body.data.total).toBe(50000);
    // buildSuggestedTitle runs server-side now that voice has merchant.name — same as receipts.
    expect(body.data.suggested_title).toContain("Starbucks");
  });

  it("surfaces validation_warning when the amount wasn't clear", async () => {
    const model = createFakeExpenseModel();
    model.parseImpl = async () =>
      JSON.stringify({
        merchant: { name: null, address: null, phone: null },
        transaction: { date: "2024-03-14", time: null, receipt_number: null },
        items: [],
        subtotal: null,
        tax: null,
        discount: null,
        service_charge: null,
        total: null,
        payment: { amount: null, cash_received: null, change: null },
        metadata: { currency: "IDR", confidence: null },
      });
    const env = envWithExpenseModel(model);

    const res = await app.fetch(
      post({ text: "beli sesuatu", referenceDate: "2024-03-14" }),
      env,
      testCtx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { metadata: { validation_warning: { en: string; id: string } | null } };
    };
    expect(body.data.metadata.validation_warning?.en).toMatch(/amount wasn't clear/);
  });

  it("leaves validation_warning null when everything is clear", async () => {
    const model = createFakeExpenseModel();
    model.parseImpl = async () => VALID_JSON;
    const env = envWithExpenseModel(model);

    const res = await app.fetch(
      post({ text: "coffee 50k at starbucks", referenceDate: "2024-03-14" }),
      env,
      testCtx,
    );
    const body = (await res.json()) as {
      data: { metadata: { validation_warning: { en: string; id: string } | null } };
    };
    expect(body.data.metadata.validation_warning).toBeNull();
  });

  it("accepts an optional language hint and passes it to the model", async () => {
    const model = createFakeExpenseModel();
    let seenLanguage: string | undefined;
    model.parseImpl = async (_transcript, _referenceDate, language) => {
      seenLanguage = language;
      return VALID_JSON;
    };
    const env = envWithExpenseModel(model);

    const res = await app.fetch(
      post({ text: "beli kopi 50 ribu", referenceDate: "2024-03-14", language: "id" }),
      env,
      testCtx,
    );
    expect(res.status).toBe(200);
    expect(seenLanguage).toBe("id");
  });

  it("returns itemized purchases when the transcript names more than one", async () => {
    const model = createFakeExpenseModel();
    model.parseImpl = async () =>
      JSON.stringify({
        merchant: { name: null, address: null, phone: null },
        transaction: { date: "2024-03-14", time: null, receipt_number: null },
        items: [
          { name: "Kopi", quantity: 1, unit_price: "15000", discount: null, total: "15000" },
          { name: "Roti", quantity: 1, unit_price: "12000", discount: null, total: "12000" },
        ],
        subtotal: "27000",
        tax: null,
        discount: null,
        service_charge: null,
        total: "27000",
        payment: { amount: "27000", cash_received: null, change: null },
        metadata: { currency: "IDR", confidence: 0.9 },
      });
    const env = envWithExpenseModel(model);

    const res = await app.fetch(
      post({ text: "kopi 15 ribu, roti 12 ribu", referenceDate: "2024-03-14" }),
      env,
      testCtx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { items: { name: string }[] } };
    expect(body.data.items).toHaveLength(2);
    expect(body.data.items[0]!.name).toBe("Kopi");
  });

  it("defaults items to [] for a plain single expense", async () => {
    const model = createFakeExpenseModel();
    model.parseImpl = async () =>
      JSON.stringify({
        merchant: { name: null, address: null, phone: null },
        transaction: { date: "2024-03-14", time: null, receipt_number: null },
        items: [],
        subtotal: null,
        tax: null,
        discount: null,
        service_charge: null,
        total: "50000",
        payment: { amount: "50000", cash_received: null, change: null },
        metadata: { currency: "IDR", confidence: 0.9 },
      });
    const env = envWithExpenseModel(model);

    const res = await app.fetch(
      post({ text: "coffee 50k", referenceDate: "2024-03-14" }),
      env,
      testCtx,
    );
    const body = (await res.json()) as { data: { items: unknown[] } };
    expect(body.data.items).toEqual([]);
  });

  it("uses the repair path and succeeds on the second attempt", async () => {
    const model = createFakeExpenseModel();
    model.parseImpl = async () => "not json";
    model.repairImpl = async () => VALID_JSON;
    const env = envWithExpenseModel(model);

    const res = await app.fetch(
      post({ text: "coffee 50k", referenceDate: "2024-03-14" }),
      env,
      testCtx,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { total: number } };
    expect(body.data.total).toBe(50000);
  });

  it("returns INVALID_MODEL_OUTPUT when repair is exhausted", async () => {
    const model = createFakeExpenseModel();
    model.parseImpl = async () => "not json";
    model.repairImpl = async () => "still not json";
    const env = envWithExpenseModel(model);

    const res = await app.fetch(
      post({ text: "coffee 50k", referenceDate: "2024-03-14" }),
      env,
      testCtx,
    );
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_MODEL_OUTPUT");
  });
});
