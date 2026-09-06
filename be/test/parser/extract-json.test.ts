import { describe, it, expect } from "vitest";
import { extractJson } from "../../src/parser/extract-json";

describe("extractJson", () => {
  it("parses a plain JSON object", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips ```json fences", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("strips bare ``` fences", () => {
    expect(extractJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("locates a JSON object amid surrounding commentary", () => {
    expect(extractJson('Sure, here is the JSON: {"a":1} — hope that helps!')).toEqual({ a: 1 });
  });

  it("handles nested braces correctly", () => {
    expect(extractJson('{"a":{"b":1},"c":2}')).toEqual({ a: { b: 1 }, c: 2 });
  });

  it("handles braces inside string values", () => {
    expect(extractJson('{"note":"use { and } carefully","a":1}')).toEqual({
      note: "use { and } carefully",
      a: 1,
    });
  });

  it("throws JsonExtractionError when no object is present", () => {
    expect(() => extractJson("no json here")).toThrow(/No JSON object found/);
  });

  it("throws JsonExtractionError on unterminated object", () => {
    expect(() => extractJson('{"a":1')).toThrow(/Unterminated JSON object/);
  });

  it("throws JsonExtractionError on invalid JSON syntax", () => {
    expect(() => extractJson("{a:1,}")).toThrow(/Failed to parse extracted JSON/);
  });
});
