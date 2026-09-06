import { describe, it, expect } from "vitest";
import app from "../../src/index";
import { buildTestEnv, testCtx, authHeaders, fakeIdentityBackend } from "./helpers";

function postValidate(env: ReturnType<typeof buildTestEnv>, headers: Record<string, string> = authHeaders()) {
  return app.fetch(new Request("http://localhost/v1/sheets/validate", { method: "POST", headers }), env, testCtx);
}

describe("POST /v1/sheets/validate", () => {
  it("requires auth", async () => {
    const res = await postValidate(buildTestEnv(), { "Content-Type": "application/json" });
    expect(res.status).toBe(401);
  });

  it("confirms a valid sheet secret, no usage metered", async () => {
    let incremented = false;
    const env = buildTestEnv({ __testIdentity: fakeIdentityBackend({ incrementUsage: async () => (incremented = true, 1) }) });
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
    const env = buildTestEnv({ __testIdentity: fakeIdentityBackend({ isBanned: async () => true }) });
    expect((await postValidate(env)).status).toBe(401);
  });
});
