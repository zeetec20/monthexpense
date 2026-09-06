import { describe, it, expect } from "vitest";
import app from "../../src/index";
import { createFakeTranscribeModel } from "../../src/ai/fake-model";
import { testCtx, authHeaders, envWithTranscribeModel, buildTestEnv } from "./helpers";

const SHORT_BASE64 = Buffer.from("fake audio bytes").toString("base64");

function post(body: unknown, headers: Record<string, string> = authHeaders()) {
  return new Request("http://localhost/v1/voice/transcribe", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("POST /v1/voice/transcribe", () => {
  it("rejects requests without a valid API key", async () => {
    const res = await app.fetch(
      post({ audio: SHORT_BASE64 }, { "Content-Type": "application/json" }),
      buildTestEnv(),
      testCtx,
    );
    expect(res.status).toBe(401);
  });

  it("rejects non-JSON content type", async () => {
    const res = await app.fetch(
      new Request("http://localhost/v1/voice/transcribe", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "text/plain" },
        body: "hi",
      }),
      buildTestEnv(),
      testCtx,
    );
    expect(res.status).toBe(415);
  });

  it("rejects empty audio", async () => {
    const res = await app.fetch(post({ audio: "" }), buildTestEnv(), testCtx);
    expect(res.status).toBe(400);
  });

  it("rejects an invalid language", async () => {
    const res = await app.fetch(post({ audio: SHORT_BASE64, language: "fr" }), buildTestEnv(), testCtx);
    expect(res.status).toBe(400);
  });

  it("returns the transcribed text", async () => {
    const model = createFakeTranscribeModel();
    model.transcribeImpl = async () => "beli nasi goreng satu";
    const env = envWithTranscribeModel(model);

    const res = await app.fetch(post({ audio: SHORT_BASE64, language: "id" }), env, testCtx);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { text: string } };
    expect(body.data.text).toBe("beli nasi goreng satu");
  });

  it("works without a language hint", async () => {
    const model = createFakeTranscribeModel();
    const env = envWithTranscribeModel(model);

    const res = await app.fetch(post({ audio: SHORT_BASE64 }), env, testCtx);
    expect(res.status).toBe(200);
  });

  it("maps a Workers AI failure to AI_UNAVAILABLE", async () => {
    const model = createFakeTranscribeModel();
    model.transcribeImpl = async () => {
      throw new Error("boom");
    };
    const env = envWithTranscribeModel(model);

    const res = await app.fetch(post({ audio: SHORT_BASE64 }), env, testCtx);
    expect(res.status).toBe(500);
  });
});
