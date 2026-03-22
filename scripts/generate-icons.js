#!/usr/bin/env node
/**
 * generate-icons.js
 *
 * Generates placeholder icon files required by the StreamDeck manifest.
 * Run once: npm run icons
 *
 * Replace the generated files with your final artwork before releasing.
 * Required sizes for Elgato Marketplace:
 *   plugin.png     — 72×72  (also plugin@2x.png 144×144, @3x 216×216)
 *   action.png     — 72×72  (also @2x, @3x)
 *   category.svg   — vector (scalable)
 *
 * PNG files created by this script use a dark-themed solid placeholder.
 */

import { deflateSync } from 'zlib';
import fs   from 'fs';
import path  from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ICONS_DIR = path.join(
  __dirname,
  '..',
  'com.dreadheadhippy.obswa.sdPlugin',
  'assets',
  'icons'
);

// ─── CRC-32 ─────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (const b of buf) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ b) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ─── PNG builder ─────────────────────────────────────────────────────────────

function pngChunk(type, data) {
  const t      = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.allocUnsafe(4);
  const crcBuf = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length, 0);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([lenBuf, t, data, crcBuf]);
}

/**
 * Build a minimal valid RGB PNG of solid colour.
 * @param {number} w Width in pixels
 * @param {number} h Height in pixels
 * @param {number} r Red   0-255
 * @param {number} g Green 0-255
 * @param {number} b Blue  0-255
 * @returns {Buffer}
 */
function makePng(w, h, r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.allocUnsafe(13);
  ihdrData.writeUInt32BE(w, 0);
  ihdrData.writeUInt32BE(h, 4);
  ihdrData[8]  = 8; // bit depth
  ihdrData[9]  = 2; // colour type: RGB (truecolour, no alpha)
  ihdrData[10] = 0; // compression method
  ihdrData[11] = 0; // filter method
  ihdrData[12] = 0; // interlace method

  // Each scanline: 1 filter byte (0 = None) + w×3 RGB bytes
  const scanline = Buffer.allocUnsafe(1 + w * 3);
  scanline[0] = 0; // filter: None
  for (let x = 0; x < w; x++) {
    scanline[1 + x * 3 + 0] = r;
    scanline[1 + x * 3 + 1] = g;
    scanline[1 + x * 3 + 2] = b;
  }
  const raw        = Buffer.concat(Array.from({ length: h }, () => scanline));
  const compressed = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdrData),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── SVG builder ─────────────────────────────────────────────────────────────

function makeSvg(label) {
  // A simple 72×72 dark rounded-rect with centred text
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72 72" width="72" height="72">
  <rect width="72" height="72" rx="10" fill="#23272A"/>
  <circle cx="36" cy="30" r="12" fill="none" stroke="#4A90D9" stroke-width="3"/>
  <circle cx="36" cy="30" r="5" fill="#4A90D9"/>
  <text x="36" y="58" font-family="sans-serif" font-size="9" font-weight="bold"
        fill="#868C95" text-anchor="middle" letter-spacing="0.5">${label}</text>
</svg>`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

fs.mkdirSync(ICONS_DIR, { recursive: true });

// Dark background colour: #23272A = rgb(35, 39, 42)
const BG = [35, 39, 42];

const pngFiles = [
  { name: 'plugin.png',     size: 72  },
  { name: 'plugin@2x.png', size: 144 },
  { name: 'action.png',     size: 72  },
  { name: 'action@2x.png', size: 144 },
];

for (const { name, size } of pngFiles) {
  const filePath = path.join(ICONS_DIR, name);
  if (fs.existsSync(filePath)) {
    console.log(`  skip  ${name}  (already exists)`);
    continue;
  }
  fs.writeFileSync(filePath, makePng(size, size, ...BG));
  console.log(`  wrote ${name}  (${size}×${size} placeholder)`);
}

const svgFiles = [
  { name: 'category.svg', label: 'OBS' },
];

for (const { name, label } of svgFiles) {
  const filePath = path.join(ICONS_DIR, name);
  if (fs.existsSync(filePath)) {
    console.log(`  skip  ${name}  (already exists)`);
    continue;
  }
  fs.writeFileSync(filePath, makeSvg(label), 'utf8');
  console.log(`  wrote ${name}  (placeholder SVG)`);
}

console.log('\nDone. Replace placeholder files with your final artwork before publishing.');
