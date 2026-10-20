// Renders the app icon (a 2x2 grid showing the four-day cycle: day, night, after night, off)
// to the PNG sizes the PWA manifest and iOS need. Run with `npm run icons`.
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const bgFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'icon-background.png');
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
await mkdir(out, { recursive: true });

// `scale` shrinks the artwork toward the centre, used for the maskable icon's safe zone.
function svg({ scale = 1 }) {
  const t = (512 - 512 * scale) / 2;
  return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <g transform="translate(${t} ${t}) scale(${scale})">
    <rect x="88" y="88" width="154" height="154" rx="38" fill="#FF9F0A"/>
    <rect x="270" y="88" width="154" height="154" rx="38" fill="#818CF8"/>
    <rect x="88" y="270" width="154" height="154" rx="38" fill="#A5A5B8" fill-opacity=".55"/>
    <rect x="270" y="270" width="154" height="154" rx="38" fill="none" stroke="#636366" stroke-width="12"/>
    <circle cx="165" cy="165" r="26" fill="#000"/>
    <g stroke="#000" stroke-width="10" stroke-linecap="round">
      <path d="M165 112v14M165 204v14M112 165h14M204 165h14M127 127l10 10M193 193l10 10M127 203l10-10M193 137l10-10"/>
    </g>
    <circle cx="347" cy="165" r="44" fill="#000"/>
    <circle cx="364" cy="152" r="38" fill="#818CF8"/>
    <text x="165" y="365" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="52" fill="#000">Zzz</text>
  </g>
</svg>`);
}

const jobs = [
  ['pwa-192x192.png', 192, svg({})],
  ['pwa-512x512.png', 512, svg({})],
  ['maskable-512x512.png', 512, svg({ scale: 0.72 })],
  // iOS applies its own rounded mask, so the touch icon must be full-bleed.
  ['apple-touch-icon-v2.png', 180, svg({})],
];
for (const [name, size, buf] of jobs) {
  const glyphs = await sharp(buf, { density: 384 }).resize(size, size).png().toBuffer();
  await sharp(bgFile)
    .resize(size, size, { fit: 'cover' })
    .composite([{ input: glyphs }])
    .flatten()
    .png()
    .toFile(path.join(out, name));
  console.log('wrote', name);
}
