// ponytail: no hand-rolled EXIF parser — createImageBitmap's
// `imageOrientation: "from-image"` is a native browser feature that already
// applies EXIF rotation for us (supported in current Chrome/Firefox/Safari).
export async function correctOrientation(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob, { imageOrientation: "from-image" });
}
