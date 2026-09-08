import { describe, it, expect } from "vitest";
import app from "../../src/index";
import { buildTestEnv, testCtx, authHeaders } from "./helpers";

describe("GET /v1/meta", () => {
  it("requires auth", async () => {
    const res = await app.fetch(new Request("http://localhost/v1/meta"), buildTestEnv(), testCtx);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns service metadata without secrets", async () => {
    const env = buildTestEnv();
    const res = await app.fetch(
      new Request("http://localhost/v1/meta", { headers: authHeaders() }),
      env,
      testCtx,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      service: "receipt-parser",
      version: env.SERVICE_VERSION,
      model: env.MODEL_NAME,
    });
  });
});
