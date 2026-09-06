import { test, expect, mock } from "bun:test";
import { isHeic, convertHeicToJpeg } from "./heic";

test("isHeic: true for image/heic and image/heif MIME types", () => {
  expect(isHeic(new Blob([], { type: "image/heic" }))).toBe(true);
  expect(isHeic(new Blob([], { type: "image/heif" }))).toBe(true);
});

test("isHeic: true for a File with empty type but .heic/.HEIC name (Safari fallback)", () => {
  expect(isHeic(new File([], "IMG_1234.heic", { type: "" }))).toBe(true);
  expect(isHeic(new File([], "IMG_1234.HEIC", { type: "" }))).toBe(true);
  expect(isHeic(new File([], "photo.heif", { type: "" }))).toBe(true);
});

test("isHeic: false for a normal jpeg Blob/File", () => {
  expect(isHeic(new Blob([], { type: "image/jpeg" }))).toBe(false);
  expect(isHeic(new File([], "receipt.jpg", { type: "image/jpeg" }))).toBe(false);
});

test("convertHeicToJpeg: converts via heic2any and unwraps an array result", async () => {
  const jpeg = new Blob(["fake-jpeg"], { type: "image/jpeg" });
  mock.module("heic2any", () => ({
    default: async () => [jpeg],
  }));
  const result = await convertHeicToJpeg(new Blob(["fake-heic"], { type: "image/heic" }));
  expect(result).toBe(jpeg);
});
