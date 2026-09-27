// Default cap for every device — was previously halved on iOS as a
// blanket guess to dodge a confirmed on-device "RangeError: Out of
// memory" in the OCR step (onnxruntime-web, see ocr.client.ts). That
// punished every iOS device permanently (most have no memory problem
// at all), and a receipt's long edge landing between this fallback and
// the real cap is exactly enough resolution loss to make small print
// unreadable — silently different OCR results for the identical image
// depending only on platform. useReceiptScanner.ts now retries at
// OOM_FALLBACK_MAX_DIMENSION only when OCR actually throws that error,
// so quality is degraded on demand, not pre-emptively.
export const DEFAULT_MAX_DIMENSION = 2500;

/** Retry-only fallback (see useReceiptScanner.ts) — never the default. */
export const OOM_FALLBACK_MAX_DIMENSION = 1600;

/** Downscales a decoded bitmap in place, before any further processing —
 * used on OOM retry to shrink ahead of cropToPaper's getImageData
 * allocation, which is large enough to OOM on a full-resolution phone
 * photo independent of the final output size resizeImage below caps. */
export const downscaleBitmap = async (
  image: ImageBitmap,
  maxDimension: number,
): Promise<ImageBitmap> => {
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  if (scale === 1) return image; // already within the cap — no copy needed

  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.drawImage(image, 0, 0, width, height);
  image.close();

  return canvas.transferToImageBitmap();
};

/** Downscales an image if it exceeds MAX_DIMENSION on its longest side. */
export const resizeImage = async (
  image: ImageBitmap,
  maxDimension = DEFAULT_MAX_DIMENSION,
): Promise<Blob> => {
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const width = Math.round(image.width * scale);
  const height = Math.round(image.height * scale);

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.drawImage(image, 0, 0, width, height);
  image.close(); // release the source bitmap, don't retain extra copies (PRD §13)

  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
};
