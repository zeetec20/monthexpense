import { describe, it, expect } from "vitest";
import app from "../../src/index";
import { buildTestEnv, testCtx, authHeaders, fakeIdentityBackend } from "./helpers";

function getQuota(env: ReturnType<typeof buildTestEnv>, headers: Record<string, string> = authHeaders()) {
  return app.fetch(new Request("http://localhost/v1/quota", { method: "GET", headers }), env, testCtx);
}

describe("GET /v1/quota", () => {
  it("requires auth", async () => {
    const res = await getQuota(buildTestEnv(), { "Content-Type": "application/json" });
    expect(res.status).toBe(401);
  });

  it("returns remaining/limit for all three groups, no usage metered", async () => {
    let incremented = false;
    const env = buildTestEnv({
      __testIdentity: fakeIdentityBackend({
        incrementUsage: async () => (incremented = true, 1),
        peekUsage: async (key) => (key.includes(":scan:") ? 5 : 0),
      }),
    });
    const res = await getQuota(env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Record<"scan" | "voice" | "text", { remaining: number; limit: number }>;
    };
    expect(body.data.scan).toEqual({ remaining: 15, limit: 20 });
    expect(body.data.voice).toEqual({ remaining: 20, limit: 20 });
    expect(body.data.text).toEqual({ remaining: 20, limit: 20 });
    expect(incremented).toBe(false); // no scan/voice/text quota unit spent
  });

  it("rejects an invalid sheet secret", async () => {
    const res = await getQuota(buildTestEnv(), { ...authHeaders(), "X-Sheet-Secret": "not-a-real-secret" });
    expect(res.status).toBe(401);
  });
});
