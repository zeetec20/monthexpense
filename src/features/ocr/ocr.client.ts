import { OCR_CONFIG } from "./ocr.config";
import type { OcrDocument } from "./ocr.types";

// ponytail: no hand-rolled ocr.worker.ts — `worker: true` below already runs
// inference in the SDK's own dedicated Worker, so a second wrapper worker
// would just add a layer with nothing to do.
//
// The SDK drags in OpenCV.js + ONNX Runtime WASM (~35MB combined) — a
// dynamic import() keeps that out of the initial page bundle so the home
// screen loads fast; it only downloads once the user actually taps Scan.
type OcrInstance = Awaited<ReturnType<typeof import("@paddleocr/paddleocr-js").PaddleOCR.create>>;
let ocrPromise: Promise<OcrInstance> | undefined;

const getOCR = () => {
  // Assignment happens synchronously (no await before it) so concurrent
  // callers share one in-flight promise instead of racing two OCR instances.
  if (!ocrPromise) {
    ocrPromise = import("@paddleocr/paddleocr-js").then(({ PaddleOCR }) =>
      PaddleOCR.create(OCR_CONFIG),
    );
  }
  return ocrPromise;
};

/** Kicks off OCR init ahead of time (e.g. on app load) so the first real scan
 * reuses the already-in-flight/resolved instance instead of starting cold. */
export const warmUpOcr = (): void => {
  void getOCR();
};

/** Runs OCR on a receipt image and returns the normalized document. */
export const recognizeReceipt = async (image: Blob): Promise<OcrDocument> => {
  const ocr = await getOCR();
  const result = await ocr.predict(image);
  return normalizeOcrResult(result);
};

/** Adapter: keeps the raw PaddleOCR result shape out of the rest of the app. */
export const normalizeOcrResult = (result: {
  items: { text: string; score: number; poly: [number, number][] }[];
  image: { width: number; height: number };
}): OcrDocument => {
  const lines = result.items.map((item) => ({
    text: item.text,
    confidence: item.score ?? null,
    poly: item.poly,
  }));

  return {
    text: lines.map((line) => line.text).join("\n"),
    lines,
    imageSize: result.image,
  };
};
