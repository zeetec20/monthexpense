import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { resilientGoogleFetch, isNetworkOrTransientError } from "./google-fetch";

describe("isNetworkOrTransientError", () => {
  it("detects TypeError (e.g. Failed to fetch)", () => {
    expect(isNetworkOrTransientError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkOrTransientError(new TypeError("Load failed"))).toBe(true);
  });

  it("detects network and chromium error messages", () => {
    expect(isNetworkOrTransientError(new Error("net::ERR_NETWORK_CHANGED"))).toBe(true);
    expect(isNetworkOrTransientError(new Error("net::ERR_NAME_NOT_RESOLVED"))).toBe(true);
    expect(isNetworkOrTransientError(new Error("Network connection lost"))).toBe(true);
    expect(isNetworkOrTransientError(new Error("Request aborted"))).toBe(true);
  });

  it("returns false for regular application/logic errors", () => {
    expect(isNetworkOrTransientError(new Error("Invalid JSON format"))).toBe(false);
    expect(isNetworkOrTransientError(new Error("404 Not Found"))).toBe(false);
  });
});

describe("resilientGoogleFetch", () => {
  const origFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("performs GET without Content-Type header", async () => {
    let capturedHeaders: Headers | undefined;
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;

    const res = await resilientGoogleFetch("token-123", "https://example.com/api");
    expect(res).toEqual({ ok: true });
    expect(capturedHeaders?.get("Authorization")).toBe("Bearer token-123");
    expect(capturedHeaders?.has("Content-Type")).toBe(false);
  });

  it("attaches Content-Type on POST with body", async () => {
    let capturedHeaders: Headers | undefined;
    let capturedBody: any;
    globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedHeaders = new Headers(init?.headers);
      capturedBody = init?.body;
      return new Response(JSON.stringify({ created: true }), { status: 200 });
    }) as unknown as typeof fetch;

    const res = await resilientGoogleFetch("token-123", "https://example.com/api", {
      method: "POST",
      body: JSON.stringify({ name: "test" }),
    });
    expect(res).toEqual({ created: true });
    expect(capturedHeaders?.get("Content-Type")).toBe("application/json");
    expect(capturedBody).toBe(JSON.stringify({ name: "test" }));
  });

  it("retries on transient network errors and succeeds", async () => {
    let attempts = 0;
    globalThis.fetch = (async () => {
      attempts++;
      if (attempts === 1) {
        throw new TypeError("Failed to fetch");
      }
      return new Response(JSON.stringify({ recovered: true }), { status: 200 });
    }) as unknown as typeof fetch;

    const res = await resilientGoogleFetch("token-123", "https://example.com/api", {
      maxRetries: 2,
      useProxyFallback: false,
    });
    expect(attempts).toBe(2);
    expect(res).toEqual({ recovered: true });
  });

  it("does NOT retry on 401 Unauthorized", async () => {
    let attempts = 0;
    globalThis.fetch = (async () => {
      attempts++;
      return new Response("Unauthorized", { status: 401 });
    }) as unknown as typeof fetch;

    let threw = false;
    try {
      await resilientGoogleFetch("expired-token", "https://example.com/api", {
        maxRetries: 2,
        useProxyFallback: false,
      });
    } catch (err: any) {
      threw = true;
      expect(err.status).toBe(401);
    }
    expect(threw).toBe(true);
    expect(attempts).toBe(1);
  });

  it("falls back to /v1/sheets/proxy when direct sheets call experiences network failure", async () => {
    let directAttempts = 0;
    let proxyCalled = false;

    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("sheets.googleapis.com")) {
        directAttempts++;
        throw new TypeError("Failed to fetch (net::ERR_NAME_NOT_RESOLVED)");
      }
      if (u.includes("/v1/sheets/proxy")) {
        proxyCalled = true;
        return new Response(JSON.stringify({ values: [["from-proxy"]] }), { status: 200 });
      }
      return new Response("Not found", { status: 404 });
    }) as unknown as typeof fetch;

    const res = await resilientGoogleFetch(
      "token-123",
      "https://sheets.googleapis.com/v4/spreadsheets/sheet-1/values/Config!A1:B2",
      {
        maxRetries: 1,
        useProxyFallback: true,
      },
    );

    expect(directAttempts).toBe(2); // Initial attempt + 1 retry
    expect(proxyCalled).toBe(true);
    expect(res).toEqual({ values: [["from-proxy"]] });
  });
});
