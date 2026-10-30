// Renders the app icon SVG to the PNG sizes the PWA manifest needs.
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// A rising sun over a horizon: the day, and the ring that fills as you log it.
const glyph = (scale = 1) => {
  const t = (n) => 256 + (n - 256) * scale;
  const rays = [-60, -30, 0, 30, 60]
    .map((deg) => {
      const r = (deg * Math.PI) / 180;
      const x1 = t(256 + Math.sin(r) * 132), y1 = t(306 - Math.cos(r) * 132);
      const x2 = t(256 + Math.sin(r) * 180), y2 = t(306 - Math.cos(r) * 180);
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#fff7e6" stroke-width="${26 * scale}" stroke-linecap="round"/>`;
    })
    .join('');
  return `${rays}
    <path d="M${t(166)} ${t(306)}a${90 * scale} ${90 * scale} 0 0 1 ${180 * scale} 0z" fill="#fff7e6"/>
    <rect x="${t(112)}" y="${t(332)}" width="${288 * scale}" height="${28 * scale}" rx="${14 * scale}" fill="#fff7e6"/>`;
};
const svg = (scale, rx) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f08a24"/><stop offset="1" stop-color="#d9480f"/></linearGradient></defs>
  <rect width="512" height="512" rx="${rx}" fill="url(#g)"/>${glyph(scale)}</svg>`;

await mkdir('public/icons', { recursive: true });
await writeFile('public/icons/icon.svg', svg(1, 112));
const png = (src, size, name) => sharp(Buffer.from(src)).resize(size, size).png().toFile(`public/icons/${name}`);
await png(svg(1, 112), 192, 'icon-192.png');
await png(svg(1, 112), 512, 'icon-512.png');
await png(svg(0.72, 0), 512, 'icon-maskable-512.png');
await png(svg(0.9, 0), 180, 'apple-touch-icon.png');
console.log('Icons written');
