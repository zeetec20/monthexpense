import { test, expect } from "bun:test";
import { reconstructLayout } from "./layout";
import type { OcrDocument } from "./ocr.types";

const line = (text: string, x0: number, y0: number, x1: number, y1: number, confidence = 0.99) => {
  return {
    text,
    confidence,
    poly: [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ] as [number, number][],
  };
};

test("reconstructLayout restores row/column order from scrambled detection order", () => {
  // Two rows ("SUSU ULTRA" / 4500 and "TOTAL" / 18000), but detection handed
  // back price-before-name and row2-before-row1 — the exact kind of
  // scrambling that broke downstream parsing. "TOTAL" is also a recognized
  // section label, so a blank line separates it from the items row above.
  const document: OcrDocument = {
    text: "",
    imageSize: { width: 300, height: 200 },
    lines: [
      line("18000", 200, 60, 260, 80), // row 2, right column
      line("4500", 200, 10, 260, 30), // row 1, right column
      line("TOTAL", 20, 60, 100, 80), // row 2, left column
      line("SUSU ULTRA", 20, 10, 150, 30), // row 1, left column
    ],
  };

  expect(reconstructLayout(document)).toBe(
    "SUSU ULTRA                             4500\n\nTOTAL                                  18000",
  );
});

test("reconstructLayout handles a single line", () => {
  const document: OcrDocument = {
    text: "",
    imageSize: { width: 100, height: 50 },
    lines: [line("ALFAMART", 10, 10, 90, 30)],
  };

  expect(reconstructLayout(document)).toBe("ALFAMART");
});

test("reconstructLayout drops very-low-confidence noise lines", () => {
  const document: OcrDocument = {
    text: "",
    imageSize: { width: 100, height: 50 },
    lines: [
      line("吴", 40, 10, 50, 20, 0.12), // misread logo glyph, low confidence
      line("ALFAMART", 10, 30, 90, 45),
    ],
  };

  expect(reconstructLayout(document)).toBe("ALFAMART");
});

test("reconstructLayout snaps price columns to a shared anchor regardless of item-name length", () => {
  // Both rows' prices sit at the same real pixel x (200) — with a short name
  // that fits comfortably before the target column, and a long name that
  // overflows past it. Both prices should land at the same shared anchor
  // when there's room, and the overflowing row still gets at least one
  // separating space instead of running straight into the price.
  const document: OcrDocument = {
    text: "",
    imageSize: { width: 400, height: 200 },
    lines: [
      line("Nasi Goreng", 20, 10, 140, 30),
      line("30001", 200, 10, 260, 30),
      line("Cookies n Cream Iced Blend Extra Large", 20, 60, 340, 80),
      line("23637", 200, 60, 260, 80),
    ],
  };

  expect(reconstructLayout(document)).toBe(
    "Nasi Goreng                 30001\n\nCookies n Cream Iced Blend Extra Large 23637",
  );
});

test("reconstructLayout inserts a blank line before a large vertical gap", () => {
  const document: OcrDocument = {
    text: "",
    imageSize: { width: 300, height: 300 },
    lines: [
      line("Nasi Goreng", 20, 10, 140, 30),
      line("30001", 200, 10, 260, 30),
      line("Thank you", 20, 200, 140, 220), // far below — footer, not a continuation
    ],
  };

  expect(reconstructLayout(document)).toBe(
    "Nasi Goreng                            30001\n\nThank you",
  );
});

test("reconstructLayout inserts a blank line before a recognized section label even without a big gap", () => {
  const document: OcrDocument = {
    text: "",
    imageSize: { width: 300, height: 300 },
    lines: [
      line("Nasi Goreng", 20, 10, 140, 30),
      line("30001", 200, 10, 260, 30),
      line("Total", 20, 32, 100, 52), // same tight spacing as a normal item row
      line("30001", 200, 32, 260, 52),
    ],
  };

  expect(reconstructLayout(document)).toBe(
    "Nasi Goreng                            30001\n\nTotal                                  30001",
  );
});
