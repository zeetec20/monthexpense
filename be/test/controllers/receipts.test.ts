import { describe, it, expect } from "vitest";
import app from "../../src/index";
import { createFakeReceiptModel } from "../../src/ai/fake-model";
import { testCtx, authHeaders, envWithModel, buildTestEnv } from "./helpers";

const VALID_JSON = JSON.stringify({
  merchant: { name: "Aqua Mart", address: null, phone: null },
  transaction: { date: "2024-03-14", time: null, receipt_number: null },
  items: [{ name: "Aqua", quantity: 2, unit_price: 4000, discount: null, total: 8000 }],
  subtotal: 8000,
  tax: null,
  discount: null,
  service_charge: null,
  total: 8000,
  payment: { amount: null },
  metadata: { currency: "IDR", confidence: 0.9 },
});

const post = (body: unknown, headers: Record<string, string> = authHeaders()) => {
  return new Request("http://localhost/v1/receipts/parse", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
};

describe("POST /v1/receipts/parse", () => {
  it("rejects requests without a valid API key", async () => {
    const res = await app.fetch(
      post({ text: "hi" }, { "Content-Type": "application/json" }),
      buildTestEnv(),
      testCtx,
    );
    expect(res.status).toBe(401);
  });

  it("rejects non-JSON content type", async () => {
    const res = await app.fetch(
      new Request("http://localhost/v1/receipts/parse", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "text/plain" },
        body: "hi",
      }),
      buildTestEnv(),
      testCtx,
    );
    expect(res.status).toBe(415);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("rejects malformed JSON bodies", async () => {
    const res = await app.fetch(
      new Request("http://localhost/v1/receipts/parse", {
        method: "POST",
        headers: authHeaders(),
        body: "{not valid json",
      }),
      buildTestEnv(),
      testCtx,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_REQUEST");
  });

  it("rejects empty text", async () => {
    const res = await app.fetch(post({ text: "" }), buildTestEnv(), testCtx);
    expect(res.status).toBe(400);
  });

  it("rejects text exceeding MAX_INPUT_LENGTH", async () => {
    const env = buildTestEnv({ MAX_INPUT_LENGTH: 10 });
    const res = await app.fetch(post({ text: "x".repeat(20) }), env, testCtx);
    expect(res.status).toBe(400);
  });

  it("returns a validated receipt for valid model output", async () => {
    const model = createFakeReceiptModel();
    model.parseImpl = async () => VALID_JSON;
    const env = envWithModel(model);

    const res = await app.fetch(post({ text: "AQUA 600ML 2 4000 8000" }), env, testCtx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { merchant: { name: string } } };
    expect(body.data.merchant.name).toBe("Aqua Mart");
  });

  it("uses the repair path and succeeds on the second attempt", async () => {
    const model = createFakeReceiptModel();
    model.parseImpl = async () => "not json";
    model.repairImpl = async () => VALID_JSON;
    const env = envWithModel(model);

    const res = await app.fetch(post({ text: "some ocr text" }), env, testCtx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { total: number } };
    expect(body.data.total).toBe(8000);
  });

  it("returns INVALID_MODEL_OUTPUT when repair is exhausted", async () => {
    const model = createFakeReceiptModel();
    model.parseImpl = async () => "not json";
    model.repairImpl = async () => "still not json";
    const env = envWithModel(model);

    const res = await app.fetch(post({ text: "some ocr text" }), env, testCtx);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_MODEL_OUTPUT");
  });

  it("sets X-Request-ID on every response", async () => {
    const res = await app.fetch(new Request("http://localhost/health"), buildTestEnv(), testCtx);
    expect(res.headers.get("X-Request-ID")).toBeTruthy();
  });

  it("answers a CORS preflight without requiring auth", async () => {
    const res = await app.fetch(
      new Request("http://localhost/v1/receipts/parse", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:5173",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "Content-Type,Authorization",
        },
      }),
      buildTestEnv(),
      testCtx,
    );
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
