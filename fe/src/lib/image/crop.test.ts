import { test, expect } from "bun:test";
import { findPaperBoundingBox } from "./crop";

const DARK = [20, 20, 20];
const BRIGHT = [220, 220, 220];

/** Builds an RGBA buffer for a WxH image, dark everywhere except the given
 * [x0,y0,x1,y1] (inclusive) rectangle, which is bright. */
function buildImage(width: number, height: number, rect?: [number, number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inRect = rect && x >= rect[0] && x <= rect[2] && y >= rect[1] && y <= rect[3];
      const [r, g, b] = inRect ? BRIGHT : DARK;
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }
  }
  return data;
}

test("finds the bounding box of a bright rectangle on a dark background", () => {
  const data = buildImage(10, 10, [2, 2, 7, 7]);
  const box = findPaperBoundingBox(data, 10, 10);
  expect(box).toEqual({ x: 2, y: 2, width: 6, height: 6 });
});

test("returns null when nothing is bright enough (no paper detected)", () => {
  const data = buildImage(10, 10);
  expect(findPaperBoundingBox(data, 10, 10)).toBeNull();
});

test("returns null when the bright region is too small a fraction of the frame (likely noise)", () => {
  const data = buildImage(20, 20, [9, 9, 10, 10]); // 2x2 bright dot in a 20x20 image
  expect(findPaperBoundingBox(data, 20, 20)).toBeNull();
});

test("returns null when the bright region covers nearly the whole frame (no real contrast to crop on)", () => {
  const data = buildImage(10, 10, [0, 0, 9, 9]);
  expect(findPaperBoundingBox(data, 10, 10)).toBeNull();
});
