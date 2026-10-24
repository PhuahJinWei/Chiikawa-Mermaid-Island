// The app icon: the user's drawing of Hachiware (art/icons/icon_02hachiware.png, the user's choice, 2026-10-24) on the
// island's sky and sea, in the PNG sizes the PWA and iOS need; the browser tab's, the face alone.
// Run with: npm run icons
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public');
const FACE = join(root, 'art', 'icons', 'icon_02hachiware.png');

/** The sky over the sea over the sand, behind the face (an app icon must be opaque: iOS fills what is clear with
 * black, and Android's maskable icon reaches to every edge). */
function backgroundSvg(s) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6EC6F0"/>
      <stop offset="0.62" stop-color="#CFEFFF"/>
      <stop offset="0.62" stop-color="#2FD1B8"/>
      <stop offset="0.8" stop-color="#1AA6C9"/>
      <stop offset="0.8" stop-color="#EBC48F"/>
      <stop offset="1" stop-color="#E3B57E"/>
    </linearGradient>
  </defs>
  <rect width="${s}" height="${s}" fill="url(#sky)"/>
</svg>`);
}

/** The face, its clear margin trimmed, `share` of the icon's width across, in the middle of a `size` square
 * (on the island's background unless `bare`). */
async function icon(size, share, bare = false) {
  const width = Math.round(size * share);
  const face = await sharp(FACE).trim().resize({ width, height: width, fit: 'inside' }).png().toBuffer();
  const { width: w, height: h } = await sharp(face).metadata();
  const base = bare
    ? sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    : sharp(backgroundSvg(size));
  return base.composite([{ input: face, left: Math.round((size - w) / 2), top: Math.round((size - h) / 2) }]).png();
}

await mkdir(out, { recursive: true });
// (The maskable icon's face within the middle 80%, the circle every launcher's mask keeps.)
const jobs = [
  ['pwa-192.png', 192, 0.82],
  ['pwa-512.png', 512, 0.82],
  ['pwa-maskable-512.png', 512, 0.66],
  ['apple-touch-icon.png', 180, 0.82],
  ['favicon-64.png', 64, 1, true],
];
for (const [name, size, share, bare] of jobs) {
  await (await icon(size, share, bare)).toFile(join(out, name));
  console.log('wrote', name);
}
