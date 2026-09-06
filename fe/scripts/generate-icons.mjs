// One-off icon generator — cleans up the AI-generated source artwork
// (scripts/logo-source.png: wallet + "ME" glyph, green rounded square,
// rough at the pixel level — JPEG ringing, banded fill, inconsistent
// corner rounding) and derives every PWA/favicon size from it. Re-run
// whenever the logo changes: `bun run generate-icons`.
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const publicDir = path.join(root, "public");
const sourcePath = path.join(root, "scripts", "logo-source.png");
const BRAND = "#5c8551";
const SIZE = 1024;

// Same corner-radius proportion as the old logo.svg (rx=16 on a 64
// viewBox = 25%) — applied as our own crisp vector mask rather than
// trusting whatever rounding the source image happened to draw.
function roundedRectMask(size, radiusRatio = 0.25) {
  const r = size * radiusRatio;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" fill="#fff"/></svg>`,
  );
}

function solidSquare(size, color) {
  return sharp({ create: { width: size, height: size, channels: 4, background: color } });
}

await mkdir(publicDir, { recursive: true });

// 1-2. Smooth the source: median denoises JPEG blockiness, a light blur
// evens out the banded green fill, sharpen restores crisp glyph edges
// lost from the blur. Ponytail-grade cleanup — good enough at icon sizes.
const cleaned = await sharp(sourcePath)
  // The source has a white margin around the actual rounded icon (it isn't
  // edge-to-edge) — trim it first, or our own mask (sized to the full
  // canvas) would keep a ring of that white margin as a visible "frame".
  .trim({ background: "#ffffff", threshold: 10 })
  .resize(SIZE, SIZE, { fit: "cover" })
  .median(3)
  .blur(0.6)
  .sharpen()
  .png()
  .toBuffer();

// 3. Force a crisp, consistent rounded-corner mask — clips away any white
// JPEG margin / inconsistent AI rounding along with it, not just covers it.
const master = await sharp(cleaned)
  .composite([{ input: roundedRectMask(SIZE), blend: "dest-in" }])
  .png()
  .toBuffer();

// 4a. "any"-purpose icons + favicon — transparent rounded corners.
await writeFile(path.join(publicDir, "icon-192.png"), await sharp(master).resize(192, 192).png().toBuffer());
await writeFile(path.join(publicDir, "icon-512.png"), await sharp(master).resize(512, 512).png().toBuffer());
await writeFile(path.join(publicDir, "favicon.png"), await sharp(master).resize(64, 64).png().toBuffer());

// 4b. Full-bleed variant — fills the transparent corners with brand green
// instead of leaving them transparent (needed for apple-touch-icon and as
// the base for the maskable icon's safe-zone padding).
const fullBleed = await solidSquare(SIZE, BRAND).composite([{ input: master }]).png().toBuffer();

// iOS ignores the manifest for the home-screen icon and applies its own
// mask shape — needs a real opaque file, no transparency.
await writeFile(path.join(publicDir, "apple-touch-icon.png"), await sharp(fullBleed).resize(180, 180).flatten({ background: BRAND }).png().toBuffer());

// Maskable icon: OS applies an arbitrary mask shape, so content must sit
// within the inner ~80% safe-zone circle on a full-bleed background.
const maskableInset = Math.round(512 * 0.8);
await writeFile(
  path.join(publicDir, "maskable-icon-512.png"),
  await solidSquare(512, BRAND)
    .composite([{ input: await sharp(fullBleed).resize(maskableInset, maskableInset).toBuffer(), gravity: "center" }])
    .png()
    .toBuffer(),
);

// No longer used — the SVG-text badge is superseded by the real artwork.
await unlink(path.join(publicDir, "logo.svg")).catch(() => {});

console.log("Generated icon-192.png, icon-512.png, maskable-icon-512.png, apple-touch-icon.png, favicon.png in public/");
