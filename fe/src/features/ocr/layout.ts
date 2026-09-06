import type { OcrDocument } from "./ocr.types";

// ponytail: fixed character budget instead of measuring terminal/viewport
// width — receipts are narrow and this stays comfortably under the parser's
// MAX_INPUT_LENGTH. Bump if a real receipt turns out wider than this reads.
const TARGET_WIDTH = 60;

// Below this, a detected "line" is more likely a misread logo/graphic than
// real text (e.g. a single garbled CJK character from a stylized header) —
// drop it rather than feed the parser noise. Deliberately lenient: only
// filters PaddleOCR's own low-confidence calls, never touches real text.
const MIN_CONFIDENCE = 0.3;

// Common receipt section labels (same terms the backend's tax/discount
// glossary already knows about) — a row starting with one of these gets a
// blank line inserted before it, so the items block and totals block read
// as visually distinct sections instead of one run-on list.
const SECTION_KEYWORDS =
  /^(subtotal|sub-total|total|tax|ppn|pb1|vat|disc(ount)?|diskon|potongan|service|items?|change|cash|payment|paid|before\s*rounding|rounding)\b/i;

interface PositionedLine {
  text: string;
  xLeft: number;
  yCenter: number;
  height: number;
}

/**
 * Reconstructs left-to-right, top-to-bottom reading order from OCR bounding
 * boxes, instead of trusting PaddleOCR's raw detection order — receipts have
 * price columns that detection order alone doesn't reliably preserve, which
 * was scrambling downstream parse results.
 *
 * Columns snap to shared anchors detected across every row (see
 * `detectColumns`), not each row's own raw pixel position — so a row's price
 * lands at the same character offset regardless of how long that row's item
 * name is. Blank lines mark section breaks (large vertical gap, or a
 * recognized totals-block label) so the items list and totals block read as
 * distinct sections, the way the receipt itself presents them.
 *
 * ponytail: single-pass nearest-to-row-anchor clustering, not a full 2D
 * layout solver — good enough for a roughly axis-aligned photo (post
 * EXIF-rotation). Upgrade to deskew-aware clustering if angled photos start
 * misclustering rows.
 */
export function reconstructLayout(document: OcrDocument): string {
  const lines: PositionedLine[] = document.lines
    .filter((line) => line.confidence === null || line.confidence >= MIN_CONFIDENCE)
    .map((line) => {
      const xs = line.poly.map(([x]) => x);
      const ys = line.poly.map(([, y]) => y);
      return {
        text: line.text,
        xLeft: Math.min(...xs),
        yCenter: (Math.min(...ys) + Math.max(...ys)) / 2,
        height: Math.max(...ys) - Math.min(...ys),
      };
    });

  const sortedByY = [...lines].sort((a, b) => a.yCenter - b.yCenter);
  const medianHeight = sortedByY[Math.floor(sortedByY.length / 2)]?.height ?? 0;
  const rowTolerance = medianHeight * 0.6 || 10;

  const rows: PositionedLine[][] = [];
  for (const line of sortedByY) {
    const row = rows.find((r) => Math.abs(r[0].yCenter - line.yCenter) <= rowTolerance);
    if (row) row.push(line);
    else rows.push([line]);
  }
  for (const row of rows) row.sort((a, b) => a.xLeft - b.xLeft);

  const originX = Math.min(...lines.map((l) => l.xLeft));
  const scale = TARGET_WIDTH / Math.max(document.imageSize.width - originX, 1);
  const columnAnchors = detectColumns(rows, document.imageSize.width);

  const out: string[] = [];
  let prevRow: PositionedLine[] | null = null;
  for (const row of rows) {
    if (prevRow && needsSectionBreak(row, prevRow, medianHeight)) out.push("");
    out.push(layoutRow(row, scale, originX, columnAnchors));
    prevRow = row;
  }
  return out.join("\n");
}

/**
 * Column anchors: gap-cluster every non-name token's xLeft across all rows
 * (same style as the row clustering above, just on the x axis) into a small
 * set of shared column positions. Ignores each row's first token — that's
 * always the name/label column, which doesn't need snapping since nothing
 * else shares its position.
 */
function detectColumns(rows: PositionedLine[][], imageWidth: number): number[] {
  const candidates = rows
    .filter((row) => row.length >= 2)
    .flatMap((row) => row.slice(1).map((token) => token.xLeft))
    .sort((a, b) => a - b);
  if (candidates.length === 0) return [];

  const gapTolerance = imageWidth * 0.08;
  const clusters: number[][] = [[candidates[0]]];
  for (const x of candidates.slice(1)) {
    const cluster = clusters[clusters.length - 1];
    if (x - cluster[cluster.length - 1] <= gapTolerance) cluster.push(x);
    else clusters.push([x]);
  }
  return clusters.map((c) => c.reduce((sum, x) => sum + x, 0) / c.length);
}

function nearestAnchor(x: number, anchors: number[]): number {
  return anchors.reduce((best, a) => (Math.abs(a - x) < Math.abs(best - x) ? a : best), anchors[0]);
}

function layoutRow(row: PositionedLine[], scale: number, originX: number, anchors: number[]): string {
  let out = "";
  row.forEach((token, index) => {
    // First token is the name/label column — keep its own position (nothing
    // else shares it). Later tokens snap to the nearest shared column anchor
    // so the same field lines up at the same character offset every row.
    const x = index === 0 || anchors.length === 0 ? token.xLeft : nearestAnchor(token.xLeft, anchors);
    const targetCol = Math.round((x - originX) * scale);
    // +1 (not just out.length) guarantees at least one separating space even
    // when a long name overflows past the target column — otherwise the
    // next token gets concatenated directly onto it with no gap at all.
    const minCol = index === 0 ? out.length : out.length + 1;
    out = out.padEnd(Math.max(minCol, targetCol), " ") + token.text;
  });
  return out;
}

function needsSectionBreak(row: PositionedLine[], prevRow: PositionedLine[], medianHeight: number): boolean {
  const gap = row[0].yCenter - prevRow[0].yCenter;
  const bigGap = gap > medianHeight * 2.2;

  const rowIsLabeled = SECTION_KEYWORDS.test(row[0].text.trim());
  const prevWasLabeled = SECTION_KEYWORDS.test(prevRow[0].text.trim());
  const enteringLabeledBlock = rowIsLabeled && !prevWasLabeled;

  return bigGap || enteringLabeledBlock;
}
