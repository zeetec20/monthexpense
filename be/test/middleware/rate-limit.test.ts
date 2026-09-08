import { describe, it, expect } from "vitest";
import app from "../../src/index";
import { testCtx, authHeaders, buildTestEnv } from "../controllers/helpers";
import type { Env } from "../../src/types/env";

const getMeta = (env: Env, headers: Record<string, string> = authHeaders()) => {
  return app.fetch(new Request("http://localhost/v1/meta", { headers }), env, testCtx);
};

/** Counts calls and enforces a real cap, keyed the same way the middleware
 * builds its key (ip:userAgent) — lets a test verify two different
 * User-Agents on the same IP get independent buckets. */
const cappedRateLimiter = (limit: number): Env["RATE_LIMITER"] => {
  const counts = new Map<string, number>();
  return {
    limit: async ({ key }) => {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return { success: count <= limit };
    },
  };
};

describe("rate limiting (/v1/*)", () => {
  it("allows requests within the limit", async () => {
    const env = buildTestEnv({ RATE_LIMITER: cappedRateLimiter(2) });
    expect((await getMeta(env)).status).toBe(200);
    expect((await getMeta(env)).status).toBe(200);
  });

  it("rejects with 429 RATE_LIMITED once the limit is exceeded", async () => {
    const env = buildTestEnv({ RATE_LIMITER: cappedRateLimiter(1) });
    expect((await getMeta(env)).status).toBe(200);

    const res = await getMeta(env);
    expect(res.status).toBe(429);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("RATE_LIMITED");
  });

  it("runs before auth — a flood of bad API keys is throttled too, not just valid ones", async () => {
    const env = buildTestEnv({ RATE_LIMITER: cappedRateLimiter(1) });
    const badAuth = { Authorization: "Bearer wrong", "Content-Type": "application/json" };

    expect((await getMeta(env, badAuth)).status).toBe(401); // first attempt: past rate limit, fails auth
    expect((await getMeta(env, badAuth)).status).toBe(429); // second: rate limit trips before auth even runs
  });

  it("gives different User-Agents on the same IP independent buckets", async () => {
    const env = buildTestEnv({ RATE_LIMITER: cappedRateLimiter(1) });
    const ip = { "CF-Connecting-IP": "203.0.113.9" };

    const resA1 = await getMeta(env, { ...authHeaders(), ...ip, "User-Agent": "BrowserA" });
    const resB1 = await getMeta(env, { ...authHeaders(), ...ip, "User-Agent": "BrowserB" });
    expect(resA1.status).toBe(200);
    expect(resB1.status).toBe(200); // different UA, same IP — its own bucket, not blocked by A's usage

    const resA2 = await getMeta(env, { ...authHeaders(), ...ip, "User-Agent": "BrowserA" });
    expect(resA2.status).toBe(429); // A's own second request now trips A's own bucket
  });
});
