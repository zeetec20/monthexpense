import { describe, it, expect } from "vitest";
import { buildParseRequestSchema } from "../../src/schemas/request";

describe("buildParseRequestSchema", () => {
  it("accepts a non-empty text field within the max length", () => {
    const schema = buildParseRequestSchema(100);
    expect(schema.safeParse({ text: "hello" }).success).toBe(true);
  });

  it("rejects an empty text field", () => {
    const schema = buildParseRequestSchema(100);
    expect(schema.safeParse({ text: "" }).success).toBe(false);
  });

  it("rejects a missing text field", () => {
    const schema = buildParseRequestSchema(100);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it("rejects text exceeding the configured max length", () => {
    const schema = buildParseRequestSchema(5);
    expect(schema.safeParse({ text: "123456" }).success).toBe(false);
  });

  it("accepts text exactly at the max length", () => {
    const schema = buildParseRequestSchema(5);
    expect(schema.safeParse({ text: "12345" }).success).toBe(true);
  });
});
