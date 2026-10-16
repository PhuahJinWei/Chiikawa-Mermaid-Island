// Draws the app icon as SVG and writes the PNG sizes the PWA and iOS need.
// Run with: npm run icons
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public');

const INK = '#5A3A2E';

function flower(cx, cy, r, fill) {
  const petals = [0, 1, 2]
    .map((k) => {
      const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
      return `<circle cx="${cx + Math.cos(a) * r * 0.62}" cy="${cy + Math.sin(a) * r * 0.62}" r="${r * 0.62}" fill="${fill}" stroke="${INK}" stroke-width="5"/>`;
    })
    .join('');
  return `${petals}<circle cx="${cx}" cy="${cy}" r="${r * 0.32}" fill="#FFF7FA"/>`;
}

/** A round white islander-guest face with a pink flower crown on a sky-and-sea background. */
function iconSvg({ safe = 1 } = {}) {
  const s = 512;
  const k = safe; // shrink the character for maskable icons
  const cx = 256;
  const cy = 300;
  const r = 168 * k;
  const crownY = cy - r * 0.62;
  const flowers = [];
  for (let i = 0; i < 7; i++) {
    const t = -0.95 + (1.9 * i) / 6;
    const fx = cx + Math.sin(t) * r * 0.98;
    const fy = crownY + (1 - Math.cos(t)) * r * 0.18;
    flowers.push(flower(fx, fy, 24 * k, '#F7CDD3'));
  }
  const ear = (side) =>
    `<ellipse cx="${cx + side * r * 0.62}" cy="${cy - r * 0.86}" rx="${r * 0.2}" ry="${r * 0.18}" fill="#FBF7EE" stroke="${INK}" stroke-width="9"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
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
  ${ear(-1)}${ear(1)}
  <ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 0.94}" fill="#FBF7EE" stroke="${INK}" stroke-width="10"/>
  ${flowers.join('')}
  <ellipse cx="${cx - r * 0.36}" cy="${cy + r * 0.05}" rx="${r * 0.085}" ry="${r * 0.11}" fill="#3B2620"/>
  <ellipse cx="${cx + r * 0.36}" cy="${cy + r * 0.05}" rx="${r * 0.085}" ry="${r * 0.11}" fill="#3B2620"/>
  <circle cx="${cx - r * 0.38}" cy="${cy - r * 0.0}" r="${r * 0.035}" fill="#fff"/>
  <circle cx="${cx + r * 0.34}" cy="${cy - r * 0.0}" r="${r * 0.035}" fill="#fff"/>
  <ellipse cx="${cx - r * 0.64}" cy="${cy + r * 0.2}" rx="${r * 0.16}" ry="${r * 0.1}" fill="#F4A3AA"/>
  <ellipse cx="${cx + r * 0.64}" cy="${cy + r * 0.2}" rx="${r * 0.16}" ry="${r * 0.1}" fill="#F4A3AA"/>
  <path d="M ${cx - r * 0.12} ${cy + r * 0.22} Q ${cx - r * 0.06} ${cy + r * 0.32} ${cx} ${cy + r * 0.24} Q ${cx + r * 0.06} ${cy + r * 0.32} ${cx + r * 0.12} ${cy + r * 0.22}" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round"/>
</svg>`;
}

await mkdir(out, { recursive: true });
const normal = Buffer.from(iconSvg());
const maskable = Buffer.from(iconSvg({ safe: 0.78 }));
const jobs = [
  [normal, 'pwa-192.png', 192],
  [normal, 'pwa-512.png', 512],
  [maskable, 'pwa-maskable-512.png', 512],
  [normal, 'apple-touch-icon.png', 180],
  [normal, 'favicon-64.png', 64],
];
for (const [svg, name, size] of jobs) {
  await sharp(svg).resize(size, size).png().toFile(join(out, name));
  console.log('wrote', name);
}
