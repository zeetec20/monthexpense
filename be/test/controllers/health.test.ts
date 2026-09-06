import { describe, it, expect } from "vitest";
import app from "../../src/index";
import { buildTestEnv, testCtx } from "./helpers";

describe("GET /health", () => {
  it("returns ok without requiring auth", async () => {
    const res = await app.fetch(new Request("http://localhost/health"), buildTestEnv(), testCtx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
