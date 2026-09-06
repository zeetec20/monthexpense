import { describe, it, expect } from "vitest";
import { z } from "zod";
import { summarizeZodError } from "../../src/parser/repair";

describe("summarizeZodError", () => {
  it("summarizes issues with path and message", () => {
    const schema = z.object({ total: z.number(), merchant: z.object({ name: z.string() }) });
    const result = schema.safeParse({ total: "not a number", merchant: {} });
    expect(result.success).toBe(false);
    if (result.success) return;
    const summary = summarizeZodError(result.error);
    expect(summary).toContain("total");
    expect(summary).toContain("merchant.name");
  });

  it("caps the number of issues included", () => {
    const schema = z.object({ a: z.number(), b: z.number(), c: z.number() });
    const result = schema.safeParse({ a: "x", b: "y", c: "z" });
    if (result.success) return;
    const summary = summarizeZodError(result.error, 2);
    expect(summary.split(";").length).toBe(2);
  });
});
