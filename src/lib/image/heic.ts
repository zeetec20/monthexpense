/** iOS Photos/Camera default format — browsers can't decode it natively
 * (no HEIC codec exposed to createImageBitmap/canvas outside Safari), so it
 * needs converting to JPEG before the rest of the pipeline can touch it. */
export const isHeic = (file: Blob): boolean => {
  if (file.type === "image/heic" || file.type === "image/heif") return true;
  // Safari sometimes reports an empty `type` for camera-captured HEIC via
  // <input type="file"> — fall back to the filename when we have one.
  const name = "name" in file && typeof file.name === "string" ? file.name : "";
  return /\.hei[cf]$/i.test(name);
};

/** Dynamic import: the WASM decoder (~1-1.5MB) only loads for users who
 * actually capture a HEIC file, not on every page load. */
export const convertHeicToJpeg = async (file: Blob): Promise<Blob> => {
  const heic2any = (await import("heic2any")).default;
  const result = await heic2any({ blob: file, toType: "image/jpeg" });
  return Array.isArray(result) ? result[0] : result;
};
