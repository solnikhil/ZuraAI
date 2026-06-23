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
import { PNG } from 'pngjs';
import { imagesToIco } from 'png-to-ico';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const SOURCE_PNG = resolve(ROOT, 'public/icon.png');
const SOURCE_MARK_PNG = resolve(ROOT, 'public/icon-mark.png');
const OUTPUT_DIR = resolve(ROOT, 'build');
const OUTPUT_ICO = resolve(OUTPUT_DIR, 'icon.ico');
const OUTPUT_SIDEBAR = resolve(OUTPUT_DIR, 'sidebar.bmp');
const ICON_SIZES = [256, 128, 64, 48, 32, 24, 16];

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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function getAlphaBounds(png) {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const alpha = png.data[(y * png.width + x) * 4 + 3];
      if (alpha > 0) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, width: png.width, height: png.height };
  }

  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function sampleBilinear(png, x, y) {
  const x0 = clamp(Math.floor(x), 0, png.width - 1);
  const y0 = clamp(Math.floor(y), 0, png.height - 1);
  const x1 = clamp(x0 + 1, 0, png.width - 1);
  const y1 = clamp(y0 + 1, 0, png.height - 1);
  const tx = x - x0;
  const ty = y - y0;

  const read = (px, py, channel) => png.data[(py * png.width + px) * 4 + channel];
  const out = [0, 0, 0, 0];

  for (let channel = 0; channel < 4; channel++) {
    const top = lerp(read(x0, y0, channel), read(x1, y0, channel), tx);
    const bottom = lerp(read(x0, y1, channel), read(x1, y1, channel), tx);
    out[channel] = lerp(top, bottom, ty);
  }

  return out;
}

function blendPixel(target, x, y, color) {
  if (x < 0 || y < 0 || x >= target.width || y >= target.height) return;

  const index = (y * target.width + x) * 4;
  const srcAlpha = color[3] / 255;
  if (srcAlpha <= 0) return;

  const dstAlpha = target.data[index + 3] / 255;
  const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);
  if (outAlpha <= 0) return;

  for (let channel = 0; channel < 3; channel++) {
    const src = color[channel] / 255;
    const dst = target.data[index + channel] / 255;
    target.data[index + channel] = Math.round(((src * srcAlpha) + (dst * dstAlpha * (1 - srcAlpha))) / outAlpha * 255);
  }
  target.data[index + 3] = Math.round(outAlpha * 255);
}

function drawRoundedTile(png) {
  const size = png.width;
  const inset = size >= 128 ? Math.round(size * 0.015) : 0;
  const radius = size * 0.22;
  const top = [0x4a, 0x4d, 0x57];
  const bottom = [0x1d, 0x20, 0x27];
  const rim = [0x63, 0x66, 0x70];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const left = inset;
      const topEdge = inset;
      const right = size - inset;
      const bottomEdge = size - inset;
      const cx = clamp(px, left + radius, right - radius);
      const cy = clamp(py, topEdge + radius, bottomEdge - radius);
      const dist = Math.hypot(px - cx, py - cy) - radius;
      const alpha = Math.round((1 - smoothstep(-0.75, 0.75, dist)) * 255);
      if (alpha <= 0) continue;

      const t = y / Math.max(size - 1, 1);
      const shade = [
        lerp(top[0], bottom[0], t),
        lerp(top[1], bottom[1], t),
        lerp(top[2], bottom[2], t),
      ];
      const rimMix = dist > -Math.max(1.2, size * 0.018) ? 0.35 : 0;
      const color = [
        lerp(shade[0], rim[0], rimMix),
        lerp(shade[1], rim[1], rimMix),
        lerp(shade[2], rim[2], rimMix),
        alpha,
      ];

      blendPixel(png, x, y, color);
    }
  }
}

function drawShadow(target, source, bounds, destX, destY, destW, destH, blurOffset, opacity) {
  const passes = [
    { dx: 0, dy: blurOffset, scale: 1, alpha: opacity },
    { dx: 0, dy: blurOffset * 0.5, scale: 1.035, alpha: opacity * 0.55 },
  ];

  for (const pass of passes) {
    const w = destW * pass.scale;
    const h = destH * pass.scale;
    const x0 = destX - (w - destW) / 2 + pass.dx;
    const y0 = destY - (h - destH) / 2 + pass.dy;
    drawResizedImage(target, source, bounds, x0, y0, w, h, [0, 0, 0], pass.alpha);
  }
}

function drawResizedImage(target, source, bounds, destX, destY, destW, destH, tint = null, opacity = 1) {
  const startX = Math.floor(destX);
  const startY = Math.floor(destY);
  const endX = Math.ceil(destX + destW);
  const endY = Math.ceil(destY + destH);

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const u = (x + 0.5 - destX) / destW;
      const v = (y + 0.5 - destY) / destH;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;

      const sampleX = bounds.x + u * (bounds.width - 1);
      const sampleY = bounds.y + v * (bounds.height - 1);
      const color = sampleBilinear(source, sampleX, sampleY);
      if (tint) {
        color[0] = tint[0];
        color[1] = tint[1];
        color[2] = tint[2];
      }
      color[3] = Math.round(color[3] * opacity);
      blendPixel(target, x, y, color);
    }
  }
}

function createIconLayer(markPng, size) {
  const png = new PNG({ width: size, height: size });
  drawRoundedTile(png);

  const bounds = getAlphaBounds(markPng);
  const markHeightRatio = size <= 32 ? 0.68 : 0.64;
  const markHeight = size * markHeightRatio;
  const markWidth = markHeight * (bounds.width / bounds.height);
  const destX = (size - markWidth) / 2;
  const destY = (size - markHeight) / 2 + size * 0.015;

  if (size >= 32) {
    drawShadow(png, markPng, bounds, destX, destY, markWidth, markHeight, Math.max(1, size * 0.025), 0.3);
  }
  drawResizedImage(png, markPng, bounds, destX, destY, markWidth, markHeight);

  return png;
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

  if (!existsSync(SOURCE_MARK_PNG)) {
    console.error(`Source mark PNG not found: ${SOURCE_MARK_PNG}`);
    process.exit(1);
  }

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 1. Generate .ico layers tuned for Windows shell sizes.
  const markPng = PNG.sync.read(readFileSync(SOURCE_MARK_PNG));
  const iconImages = ICON_SIZES.map((size) => createIconLayer(markPng, size));
  const icoBuffer = imagesToIco(iconImages);
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
