import { correctOrientation } from "./orientation";
import { resizeImage, downscaleBitmap, DEFAULT_MAX_DIMENSION } from "./resize";
import { isHeic, convertHeicToJpeg } from "./heic";
import { cropToPaper } from "./crop";

/** Orientation-correct, bound to maxDimension, crop out background, then
 * downscale to maxDimension again (crop can only shrink further, never
 * grow), per PRD §13. The bound is applied *before* cropToPaper, not just
 * at the end — its getImageData call is the biggest allocation in this
 * pipeline, and running it on a full sensor-resolution photo (12-48MP)
 * uncapped was still both a real OOM source and, on WebKit's known
 * canvas-size ceilings, a silent-corruption source (draws blank/garbled
 * data instead of throwing) — the "succeeds with empty items" failure
 * mode. `maxDimension` is overridable so useReceiptScanner.ts's OOM retry
 * can still ask for an even smaller bound. */
export async function preprocessReceiptImage(file: Blob, maxDimension = DEFAULT_MAX_DIMENSION): Promise<Blob> {
  const source = isHeic(file) ? await convertHeicToJpeg(file) : file;
  const oriented = await correctOrientation(source);
  const bounded = await downscaleBitmap(oriented, maxDimension);
  const cropped = await cropToPaper(bounded);
  return resizeImage(cropped, maxDimension);
}
