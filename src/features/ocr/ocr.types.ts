export interface OcrLine {
  text: string;
  confidence: number | null;
  /** 4-corner bounding box in image pixel coords, used by layout.ts. */
  poly: [number, number][];
}

export interface OcrDocument {
  text: string;
  lines: OcrLine[];
  imageSize: { width: number; height: number };
}
