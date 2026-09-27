import { describe, it, expect } from "vitest";
import app from "../../../src/worker/index";
import { buildTestEnv, testCtx, authHeaders, fakeIdentityBackend } from "./helpers";

const postValidate = (
  env: ReturnType<typeof buildTestEnv>,
  headers: Record<string, string> = authHeaders(),
) => {
  return app.fetch(
    new Request("http://localhost/v1/sheets/validate", { method: "POST", headers }),
    env,
    testCtx,
  );
};

describe("POST /v1/sheets/validate", () => {
  it("requires auth", async () => {
    const res = await postValidate(buildTestEnv(), { "Content-Type": "application/json" });
    expect(res.status).toBe(401);
  });

  it("confirms a valid sheet secret, no usage metered", async () => {
    let incremented = false;
    const env = buildTestEnv({
      __testIdentity: fakeIdentityBackend({
        incrementUsage: async () => ((incremented = true), 1),
      }),
    });
    const res = await postValidate(env);
    expect(res.status).toBe(200);
    expect((await res.json()) as unknown).toEqual({ data: { ok: true } });
    expect(incremented).toBe(false); // no scan/voice quota unit spent
  });

  it("rejects an invalid sheet secret", async () => {
    const res = await postValidate(buildTestEnv(), {
      ...authHeaders(),
      "X-Sheet-Secret": "not-a-real-secret",
    });
    expect(res.status).toBe(401);
  });

  it("rejects a banned uuid", async () => {
    const env = buildTestEnv({
      __testIdentity: fakeIdentityBackend({ isBanned: async () => true }),
    });
    expect((await postValidate(env)).status).toBe(401);
  });
});

describe("POST /v1/sheets/proxy", () => {
  it("requires API key auth", async () => {
    const res = await app.fetch(
      new Request("http://localhost/v1/sheets/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://sheets.googleapis.com/v4/spreadsheets/123" }),
      }),
      buildTestEnv(),
      testCtx,
    );
    expect(res.status).toBe(401);
  });

  it("rejects an invalid/unauthorized URL", async () => {
    const res = await app.fetch(
      new Request("http://localhost/v1/sheets/proxy", {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
          "X-Google-Token": "ya29.test",
        },
        body: JSON.stringify({ url: "https://evil.com/steal-token" }),
      }),
      buildTestEnv(),
      testCtx,
    );
    expect(res.status).toBe(400);
  });

  it("rejects requests missing X-Google-Token", async () => {
    const res = await app.fetch(
      new Request("http://localhost/v1/sheets/proxy", {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: "https://sheets.googleapis.com/v4/spreadsheets/123" }),
      }),
      buildTestEnv(),
      testCtx,
    );
    expect(res.status).toBe(401);
  });

  it("proxies request to sheets.googleapis.com", async () => {
    const origFetch = globalThis.fetch;
    let forwardedUrl = "";
    let forwardedHeaders: Headers | undefined;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      forwardedUrl = String(input);
      forwardedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ spreadsheetId: "sheet-456" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;

    try {
      const res = await app.fetch(
        new Request("http://localhost/v1/sheets/proxy", {
          method: "POST",
          headers: {
            ...authHeaders(),
            "Content-Type": "application/json",
            "X-Google-Token": "ya29.valid-token",
          },
          body: JSON.stringify({
            url: "https://sheets.googleapis.com/v4/spreadsheets/sheet-456/values/Config!A1:B2",
            method: "GET",
          }),
        }),
        buildTestEnv(),
        testCtx,
      );

      expect(res.status).toBe(200);
      expect(forwardedUrl).toBe(
        "https://sheets.googleapis.com/v4/spreadsheets/sheet-456/values/Config!A1:B2",
      );
      expect(forwardedHeaders?.get("Authorization")).toBe("Bearer ya29.valid-token");
      expect((await res.json()) as unknown).toEqual({ spreadsheetId: "sheet-456" });
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

