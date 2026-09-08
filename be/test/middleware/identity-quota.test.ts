import { describe, it, expect } from "vitest";
import app from "../../src/index";
import { createFakeReceiptModel } from "../../src/ai/fake-model";
import {
  testCtx,
  envWithModel,
  fakeIdentityBackend,
  TEST_SPREADSHEET_ID,
  TEST_SHEET_SECRET,
} from "../controllers/helpers";
import type { Env } from "../../src/types/env";

const postReceipt = (env: Env, headers: Record<string, string> = {}) => {
  return app.fetch(
    new Request("http://localhost/v1/receipts/parse", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-api-key",
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({ text: "some receipt text" }),
    }),
    env,
    testCtx,
  );
};

const postReceiptText = (env: Env, headers: Record<string, string> = {}) => {
  return app.fetch(
    new Request("http://localhost/v1/receipts/parse-text", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-api-key",
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({ text: "some pasted chat receipt text" }),
    }),
    env,
    testCtx,
  );
};

const validHeaders = {
  "X-Sheet-Secret": TEST_SHEET_SECRET,
  "X-Spreadsheet-Id": TEST_SPREADSHEET_ID,
};

describe("identityQuota (/v1/receipts/parse)", () => {
  it("rejects a request missing the sheet identity headers", async () => {
    const res = await postReceipt(envWithModel(createFakeReceiptModel()));
    expect(res.status).toBe(401);
  });

  it("rejects a secret that matches neither known signing key", async () => {
    const env = envWithModel(createFakeReceiptModel());
    expect((await postReceipt(env, validHeaders)).status).toBe(200); // sanity: the valid pair works

    const wrong = await postReceipt(env, {
      "X-Sheet-Secret": "not-a-real-secret",
      "X-Spreadsheet-Id": TEST_SPREADSHEET_ID,
    });
    expect(wrong.status).toBe(401);
  });

  it("recognizes a premium-signed secret as premium tier with no backend record lookup", async () => {
    const env = envWithModel(createFakeReceiptModel(), {
      __testIdentity: fakeIdentityBackend({
        verify: async (secret) =>
          secret === TEST_SHEET_SECRET ? { uuid: "premium-uuid", tier: "premium" } : null,
        incrementUsage: async () => 45, // well past the standard cap (20), still under premium's (80)
      }),
    });
    expect((await postReceipt(env, validHeaders)).status).toBe(200);
  });

  it("locks onto the first spreadsheetId it sees for a uuid", async () => {
    const env = envWithModel(createFakeReceiptModel(), { __testIdentity: fakeIdentityBackend() });
    const res = await postReceipt(env, {
      "X-Sheet-Secret": TEST_SHEET_SECRET,
      "X-Spreadsheet-Id": "first-sheet",
    });
    expect(res.status).toBe(200);
  });

  it("rejects a second, different spreadsheetId for the same uuid (one uuid, one sheet — the real backend also bans the uuid for 2 days on this path)", async () => {
    const env = envWithModel(createFakeReceiptModel(), { __testIdentity: fakeIdentityBackend() });
    const first = await postReceipt(env, {
      "X-Sheet-Secret": TEST_SHEET_SECRET,
      "X-Spreadsheet-Id": "first-sheet",
    });
    expect(first.status).toBe(200);

    const second = await postReceipt(env, {
      "X-Sheet-Secret": TEST_SHEET_SECRET,
      "X-Spreadsheet-Id": "a-different-sheet",
    });
    expect(second.status).toBe(401);
  });

  it("rejects an already-banned uuid before even checking the lock", async () => {
    const env = envWithModel(createFakeReceiptModel(), {
      __testIdentity: fakeIdentityBackend({ isBanned: async () => true }),
    });
    expect((await postReceipt(env, validHeaders)).status).toBe(401);
  });

  it("rejects with 429 once the standard-tier daily cap (20) is exceeded", async () => {
    const env = envWithModel(createFakeReceiptModel(), {
      __testIdentity: fakeIdentityBackend({ incrementUsage: async () => 21 }),
    });
    const res = await postReceipt(env, validHeaders);
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("RATE_LIMITED");
  });

  it("includes the remaining/limit quota in a successful response", async () => {
    const env = envWithModel(createFakeReceiptModel(), {
      __testIdentity: fakeIdentityBackend({ incrementUsage: async () => 5 }),
    });
    const body = (await (await postReceipt(env, validHeaders)).json()) as {
      quota: { remaining: number; limit: number };
    };
    expect(body.quota).toEqual({ remaining: 15, limit: 20 });
  });

  it("tracks /v1/receipts/parse-text's 'text' group independently from 'scan'", async () => {
    const counts = new Map<string, number>();
    const env = envWithModel(createFakeReceiptModel(), {
      __testIdentity: fakeIdentityBackend({
        incrementUsage: async (key) => {
          const next = (counts.get(key) ?? 0) + 1;
          counts.set(key, next);
          return next;
        },
      }),
    });

    const scanBody = (await (await postReceipt(env, validHeaders)).json()) as {
      quota: { remaining: number; limit: number };
    };
    const textBody = (await (await postReceiptText(env, validHeaders)).json()) as {
      quota: { remaining: number; limit: number };
    };
    // Each is the first hit of its own bucket — if they shared a counter,
    // the second call (text) would read remaining: 18, not 19.
    expect(scanBody.quota).toEqual({ remaining: 19, limit: 20 });
    expect(textBody.quota).toEqual({ remaining: 19, limit: 20 });
  });
});
