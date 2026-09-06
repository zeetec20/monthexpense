import { describe, it, expect, vi } from "vitest";
import { createReceiptModel } from "../../src/ai/model";
import { RECEIPT_JSON_SCHEMA } from "../../src/ai/prompt";
import type { Env } from "../../src/types/env";

// createWorkersAIReceiptModel (the real Workers AI adapter) is always
// swapped out for the fake model in every other test — this is its only
// coverage, specifically for the response_format wiring.
describe("createWorkersAIReceiptModel (via createReceiptModel)", () => {
  it("passes response_format with the receipt JSON schema to env.AI.run", async () => {
    const run = vi.fn().mockResolvedValue({ response: "{}" });
    const env = {
      AI: { run } as unknown as Ai,
      MODEL_NAME: "@cf/meta/llama-3.1-8b-instruct-fast",
      AI_TIMEOUT_MS: 15000,
      LOCAL_MOCK_AI: false,
    } as unknown as Env;

    const model = createReceiptModel(env);
    await model.parse("some ocr text");

    expect(run).toHaveBeenCalledTimes(1);
    const [calledModel, options] = run.mock.calls[0]!;
    expect(calledModel).toBe("@cf/meta/llama-3.1-8b-instruct-fast");
    expect(options.response_format).toEqual({ type: "json_schema", json_schema: RECEIPT_JSON_SCHEMA });
  });
});
