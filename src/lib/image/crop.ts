// Lightweight background-isolation crop — not a document scanner (no
// perspective warp / skew correction), just cuts out the background clutter
// around a receipt photographed on a table. See plan notes: full OpenCV
// contour+warp would need its own separate WASM worker instance (paddleocr-js
// doesn't expose its internal one), for a case this doesn't actually need.

const BRIGHTNESS_THRESHOLD = 180;
// A row/column counts as "paper" once this fraction of its pixels are bright
// — a majority-vote per row/column, so a few stray bright specks in the
// background (reflections, other objects) can't drag the box out on their own.
const ROW_COL_FRACTION = 0.3;
// Detection is unreliable outside this range — too small = probably noise,
// not the receipt; too large = probably no real contrast to threshold on
// (e.g. a bright background too). No crop-adjustment UI to recover a bad
// detection, so bail out and pass the image through unchanged instead.
const MIN_AREA_FRACTION = 0.25;
const MAX_AREA_FRACTION = 0.95;

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Pure pixel-buffer math, no canvas/DOM — testable directly under `bun test`
 * (same split as isHeic/convertHeicToJpeg). `data` is RGBA bytes (4 per
 * pixel), `width`/`height` in pixels. Returns null when detection doesn't
 * look trustworthy enough to act on.
 */
export const findPaperBoundingBox = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
): BoundingBox | null => {
  const rowBrightCount = Array.from({ length: height }, () => 0);
  const colBrightCount = Array.from({ length: width }, () => 0);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (luminance > BRIGHTNESS_THRESHOLD) {
        rowBrightCount[y]++;
        colBrightCount[x]++;
      }
    }
  }

  const rowThreshold = width * ROW_COL_FRACTION;
  const colThreshold = height * ROW_COL_FRACTION;

  let top = -1,
    bottom = -1,
    left = -1,
    right = -1;
  for (let y = 0; y < height; y++) {
    if (rowBrightCount[y] >= rowThreshold) {
      if (top === -1) top = y;
      bottom = y;
    }
  }
  for (let x = 0; x < width; x++) {
    if (colBrightCount[x] >= colThreshold) {
      if (left === -1) left = x;
      right = x;
    }
  }

  if (top === -1 || left === -1) return null;

  const box = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  const areaFraction = (box.width * box.height) / (width * height);
  if (areaFraction < MIN_AREA_FRACTION || areaFraction > MAX_AREA_FRACTION) return null;

  return box;
};

/** Crops to the detected paper region (with a small margin), or passes the
 * image through unchanged if detection isn't confident enough. Takes
 * ownership of `image` — closes it once consumed, same convention as
 * resizeImage. */
export const cropToPaper = async (image: ImageBitmap): Promise<ImageBitmap> => {
  const canvas = new OffscreenCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(image, 0, 0);

  const { data } = ctx.getImageData(0, 0, image.width, image.height);
  const box = findPaperBoundingBox(data, image.width, image.height);
  if (!box) return image; // unreliable — leave uncropped, caller still owns it

  const margin = Math.round(Math.min(box.width, box.height) * 0.03);
  const x = Math.max(0, box.x - margin);
  const y = Math.max(0, box.y - margin);
  const width = Math.min(image.width - x, box.width + margin * 2);
  const height = Math.min(image.height - y, box.height + margin * 2);

  const cropCanvas = new OffscreenCanvas(width, height);
  const cropCtx = cropCanvas.getContext("2d");
  if (!cropCtx) throw new Error("Canvas 2D context unavailable");
  cropCtx.drawImage(canvas, x, y, width, height, 0, 0, width, height);
  image.close();

  return cropCanvas.transferToImageBitmap();
};
