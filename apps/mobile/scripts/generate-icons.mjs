#!/usr/bin/env node
// Rasterizes a Potlucky logo SVG into every size the app needs.
//
// Preview mode (stage 1 — picking a variant): point this at logo-a/b/c.svg
// with an --out-dir under the scratchpad. It writes launcher, adaptive-mask,
// monochrome/themed, and splash previews so a variant can be judged at real
// pixel sizes instead of guessed at from the source SVG.
//
// Stage 2 (after a variant is picked): point this at the winning file, renamed
// to apps/mobile/assets/logo.svg, with --out-dir apps/mobile/assets/images —
// it writes icon.png, android-icon-foreground.png, android-icon-monochrome.png,
// favicon.png, and splash-icon.png at the sizes app.json expects.
//
// Usage: node generate-icons.mjs <logo.svg> <outDir> [--app]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import sharp from 'sharp';

const [, , svgPath, outDirArg, ...flags] = process.argv;
if (!svgPath || !outDirArg) {
  console.error('Usage: node generate-icons.mjs <logo.svg> <outDir> [--app]');
  process.exit(1);
}
const outDir = outDirArg;
const appMode = flags.includes('--app');
mkdirSync(outDir, { recursive: true });
const name = basename(svgPath, extname(svgPath));

const raw = readFileSync(svgPath, 'utf8');
// Themed/monochrome Android icons are drawn in a single color — swap the
// mark's accent stroke/fill for white so it reads correctly on the OS's own
// tinted background.
const monoSvg = raw.replaceAll('#4B6B4F', '#FFFFFF');

const BG = '#FAFAF8'; // Mercado `background` token, Design.md
const ACCENT = '#4B6B4F'; // Mercado `accent` token, Design.md

async function markOnBg(svgString, size, padFrac, background) {
  const pad = Math.round(size * padFrac);
  const markSize = Math.max(1, size - pad * 2);
  const mark = await sharp(Buffer.from(svgString)).resize(markSize, markSize).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: mark, left: pad, top: pad }])
    .png()
    .toBuffer();
}

async function markOnTransparent(svgString, size, padFrac) {
  return markOnBg(svgString, size, padFrac, { r: 0, g: 0, b: 0, alpha: 0 });
}

async function circleMasked(svgString, size, padFrac) {
  const full = await markOnBg(svgString, size, padFrac, BG);
  const maskSvg = `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`;
  const mask = await sharp(Buffer.from(maskSvg)).png().toBuffer();
  return sharp(full).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

async function monochromeCircle(svgMonoString, size, padFrac) {
  const pad = Math.round(size * padFrac);
  const markSize = size - pad * 2;
  const mark = await sharp(Buffer.from(svgMonoString)).resize(markSize, markSize).png().toBuffer();
  const circleSvg = `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${ACCENT}"/></svg>`;
  const base = await sharp(Buffer.from(circleSvg)).png().toBuffer();
  return sharp(base).composite([{ input: mark, left: pad, top: pad }]).png().toBuffer();
}

async function splash(svgString, w, h) {
  const markW = Math.round(w * 0.32);
  const mark = await sharp(Buffer.from(svgString)).resize(markW, markW).png().toBuffer();
  return sharp({ create: { width: w, height: h, channels: 4, background: BG } })
    .composite([{ input: mark, left: Math.round((w - markW) / 2), top: Math.round((h - markW) / 2) }])
    .png()
    .toBuffer();
}

const previewJobs = [
  ['full-1024.png', () => markOnBg(raw, 1024, 0.2, BG)],
  ['launcher-48.png', () => markOnBg(raw, 48, 0.16, BG)],
  ['launcher-96.png', () => markOnBg(raw, 96, 0.16, BG)], // 2x, for retina judging
  ['adaptive-circle-128.png', () => circleMasked(raw, 128, 0.28)],
  ['monochrome-circle-128.png', () => monochromeCircle(monoSvg, 128, 0.3)],
  ['splash-412x900.png', () => splash(raw, 412, 900)],
];

// App-icon safe zone: Android adaptive icons crop the foreground layer hard,
// so the mark needs a bigger margin (66% safe zone ⇒ ~0.34 pad) than the
// square store icon (0.2 pad) does.
const appJobs = [
  ['icon.png', () => markOnBg(raw, 1024, 0.2, BG)],
  ['android-icon-foreground.png', () => markOnTransparent(raw, 512, 0.34)],
  ['android-icon-monochrome.png', () => markOnTransparent(monoSvg, 512, 0.34)],
  ['favicon.png', () => markOnBg(raw, 48, 0.16, BG)],
  ['splash-icon.png', () => markOnBg(raw, 512, 0.24, BG)],
];

const jobs = appMode ? appJobs : previewJobs;

for (const [file, fn] of jobs) {
  const buf = await fn();
  const outFile = appMode ? join(outDir, file) : join(outDir, `${name}-${file}`);
  writeFileSync(outFile, buf);
  console.log('wrote', outFile);
}
