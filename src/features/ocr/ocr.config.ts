export const OCR_CONFIG = {
  lang: "en",
  ocrVersion: "PP-OCRv5",
  worker: true,
  runtime: {
    backend: "wasm",
    wasmPaths: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.3/dist/",
    // ponytail: single-threaded WASM — slower than threaded, but threaded
    // wasm needs crossOriginIsolated (COOP+COEP headers on every response,
    // dev server and preview both). Revisit if OCR latency becomes the
    // bottleneck; until then this is one config line instead of a server
    // header surface.
    numThreads: 1,
    simd: true,
  },
} as const;
