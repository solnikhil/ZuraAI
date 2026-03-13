/**
 * Generate Windows installer assets from source PNG.
 *
 * Usage:  node scripts/generate-icons.mjs
 *
 * Requires: png-to-ico (devDependency)
 * Output:
 *   build/icon.ico      — app icon (multi-resolution)
 *   build/sidebar.bmp   — dark sidebar bitmap for NSIS welcome/finish pages (164x314)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const SOURCE_PNG = resolve(ROOT, 'public/icon.png');
const OUTPUT_DIR = resolve(ROOT, 'build');
const OUTPUT_ICO = resolve(OUTPUT_DIR, 'icon.ico');
const OUTPUT_SIDEBAR = resolve(OUTPUT_DIR, 'sidebar.bmp');

// --- Dark theme palette (Catppuccin Mocha inspired) ---
const COLORS = {
  crust:    [0x0B, 0x0B, 0x14],  // deepest dark
  base:     [0x1E, 0x1E, 0x2E],  // main background
  surface0: [0x31, 0x32, 0x44],  // elevated surface
  blue:     [0x89, 0xB4, 0xFA],  // accent
};

/**
 * Linear interpolation between two values.
 */
function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

/**
 * Create a 24-bit BMP file buffer.
 * pixelFn(x, y) => [r, g, b]  where y=0 is the TOP of the image.
 */
function createBMP(width, height, pixelFn) {
  const rowBytes = width * 3;
  const rowPadding = (4 - (rowBytes % 4)) % 4;
  const rowSize = rowBytes + rowPadding;
  const pixelDataSize = rowSize * height;
  const fileSize = 14 + 40 + pixelDataSize;

  const buf = Buffer.alloc(fileSize);

  // ---- File header (14 bytes) ----
  buf.write('BM', 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(0, 6);          // reserved
  buf.writeUInt32LE(54, 10);        // pixel data offset

  // ---- BITMAPINFOHEADER (40 bytes) ----
  buf.writeUInt32LE(40, 14);        // header size
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);     // positive = bottom-up
  buf.writeUInt16LE(1, 26);         // planes
  buf.writeUInt16LE(24, 28);        // bits per pixel
  buf.writeUInt32LE(0, 30);         // compression (none)
  buf.writeUInt32LE(pixelDataSize, 34);
  buf.writeInt32LE(2835, 38);       // X px/meter (~72 DPI)
  buf.writeInt32LE(2835, 42);       // Y px/meter
  buf.writeUInt32LE(0, 46);         // colors used
  buf.writeUInt32LE(0, 50);         // important colors

  // ---- Pixel data (bottom-up rows) ----
  for (let row = 0; row < height; row++) {
    const y = height - 1 - row;     // flip: row 0 in BMP = bottom of image
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelFn(x, y);
      const off = 54 + row * rowSize + x * 3;
      buf[off]     = b;  // BMP stores BGR
      buf[off + 1] = g;
      buf[off + 2] = r;
    }
    // Row padding bytes are already 0 from Buffer.alloc
  }

  return buf;
}

/**
 * Generate the dark sidebar bitmap (164 x 314) for the NSIS installer.
 *
 * Features:
 *  - Three-stop dark gradient (crust → base → mantle)
 *  - Soft blue accent glow near the bottom
 *  - Subtle dithering for a textured, non-flat look
 */
function generateSidebarBMP() {
  const W = 164;
  const H = 314;

  const top    = COLORS.crust;      // deepest dark
  const mid    = COLORS.base;       // main bg
  const bottom = [0x18, 0x18, 0x25]; // mantle
  const accent = COLORS.blue;

  // Accent glow center (near lower third)
  const glowY = Math.round(H * 0.78);
  const glowRadius = 12;
  const glowPeakAlpha = 0.35;

  // Seeded pseudo-random for deterministic dithering
  let seed = 42;
  function noise() {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return ((seed >> 16) & 0xFF) / 255.0; // 0..1
  }

  return createBMP(W, H, (x, y) => {
    // --- Three-stop gradient ---
    let r, g, b;
    const t = y / (H - 1);
    if (t < 0.5) {
      const u = t / 0.5;
      r = lerp(top[0], mid[0], u);
      g = lerp(top[1], mid[1], u);
      b = lerp(top[2], mid[2], u);
    } else {
      const u = (t - 0.5) / 0.5;
      r = lerp(mid[0], bottom[0], u);
      g = lerp(mid[1], bottom[1], u);
      b = lerp(mid[2], bottom[2], u);
    }

    // --- Soft accent glow ---
    const dist = Math.abs(y - glowY);
    if (dist < glowRadius) {
      // Horizontal fade at edges
      const fadeZone = 30;
      let hFade = 1.0;
      if (x < fadeZone)     hFade = x / fadeZone;
      if (x > W - fadeZone) hFade = (W - x) / fadeZone;

      const glow = (1 - dist / glowRadius) * glowPeakAlpha * hFade;
      r = lerp(r, accent[0], glow);
      g = lerp(g, accent[1], glow);
      b = lerp(b, accent[2], glow);
    }

    // --- Subtle dithering (±2 per channel) ---
    const n = (noise() - 0.5) * 4;
    r = Math.max(0, Math.min(255, Math.round(r + n)));
    g = Math.max(0, Math.min(255, Math.round(g + n)));
    b = Math.max(0, Math.min(255, Math.round(b + n)));

    return [r, g, b];
  });
}

// -----------------------------------------------------------------------

async function main() {
  if (!existsSync(SOURCE_PNG)) {
    console.error(`Source PNG not found: ${SOURCE_PNG}`);
    process.exit(1);
  }

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 1. Generate .ico from PNG
  const pngToIco = (await import('png-to-ico')).default;
  const pngBuffer = readFileSync(SOURCE_PNG);
  const icoBuffer = await pngToIco(pngBuffer);
  writeFileSync(OUTPUT_ICO, icoBuffer);
  console.log(`  icon  -> ${OUTPUT_ICO}`);

  // 2. Generate dark sidebar BMP
  const sidebarBuf = generateSidebarBMP();
  writeFileSync(OUTPUT_SIDEBAR, sidebarBuf);
  console.log(`  sidebar -> ${OUTPUT_SIDEBAR}`);

  console.log('Installer assets generated.');
}

main().catch((err) => {
  console.error('Asset generation failed:', err);
  process.exit(1);
});
