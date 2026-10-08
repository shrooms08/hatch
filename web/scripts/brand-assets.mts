// Generates the Hatch brand assets from the meteor-egg mark (design/v1 HatchMark):
//   web/public: favicon.ico (16+32+48), favicon.svg, apple-touch-icon.png (180), brand/icon-192.png,
//               brand/icon-512.png, brand/hatch-mark*.svg, og.png (1200x630 social preview)
//   extension/public/icon: 16, 32, 48, 96, 128 px
// Run: pnpm brand-assets (from web/). Uses resvg + the bundled OFL fonts in web/assets/fonts.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const WEB = path.resolve(import.meta.dirname, '..');
const EXT = path.resolve(WEB, '../extension');
const FONTS = ['Unbounded-Bold.ttf', 'GeistMono-Medium.ttf', 'GeistMono-SemiBold.ttf'].map((f) => path.join(WEB, 'assets/fonts', f));

const NIGHT = '#120E0B';
const YOLK = '#F2A93B';
const SHELL = '#F6EEDC';

/** The mark's geometry in a 64x64 box. */
const markGroup = (body: string, yolk: string) =>
  `<g transform="translate(-3.5 3.5)"><path d="M0 -40 L13.9 -5.6 A15 15 0 1 1 -13.9 -5.6 Z" transform="translate(24 40) rotate(45)" fill="${body}" stroke="${body}" stroke-width="5" stroke-linejoin="round"/><circle cx="24" cy="40" r="9" fill="${yolk}"/><path d="M53 35 L61.5 26.5 M27.6 12.4 L36 4" stroke="${body}" stroke-width="6" stroke-linecap="round"/></g>`;

const markSvg = (body: string, yolk: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none">${markGroup(body, yolk)}</svg>`;

/** App / extension / favicon icon: Yolk tile (radius 22%) with a Night mark and Shell yolk. */
const appIconSvg = (size: number) => {
  const r = Math.round(size * 0.22);
  const pad = size * 0.16;
  const s = (size - pad * 2) / 64;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${r}" fill="${YOLK}"/><g transform="translate(${pad} ${pad}) scale(${s})">${markGroup(NIGHT, SHELL)}</g></svg>`;
};

const png = (svg: string, width: number) =>
  Buffer.from(new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: 'Geist Mono' } }).render().asPng());

/** ICO container holding PNG images (supported by all current browsers). */
function ico(images: { size: number; data: Buffer }[]) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const dir = Buffer.alloc(16 * images.length);
  let offset = 6 + dir.length;
  images.forEach(({ size, data }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt16LE(1, o + 4); // planes
    dir.writeUInt16LE(32, o + 6); // bpp
    dir.writeUInt32LE(data.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([header, dir, ...images.map((im) => im.data)]);
}

const ogSvg = () => {
  const egg = 'M0 157 A105 157 0 0 1 210 157 A105 105 0 0 1 0 157 Z';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs>
  <pattern id="dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="12" cy="12" r="1.2" fill="${SHELL}" fill-opacity="0.08"/></pattern>
  <radialGradient id="glow" cx="900" cy="300" r="360" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${YOLK}" stop-opacity="0.28"/><stop offset="1" stop-color="${YOLK}" stop-opacity="0"/></radialGradient>
  <clipPath id="egg"><path d="${egg}"/></clipPath>
  <filter id="drop" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="30" stdDeviation="30" flood-color="#000" flood-opacity="0.55"/></filter>
</defs>
<rect width="1200" height="630" fill="${NIGHT}"/>
<rect width="1200" height="630" fill="url(#dots)"/>
<rect width="1200" height="630" fill="url(#glow)"/>
<g transform="translate(80 72) scale(0.875)">${markGroup(SHELL, YOLK)}</g>
<text x="146" y="113" font-family="Unbounded" font-weight="700" font-size="40" letter-spacing="-0.8" fill="${SHELL}">Hatch</text>
<text x="80" y="300" font-family="Unbounded" font-weight="700" font-size="92" letter-spacing="-4" fill="${SHELL}">Launch</text>
<text x="80" y="396" font-family="Unbounded" font-weight="700" font-size="92" letter-spacing="-4" fill="${SHELL}">anything</text>
<text x="80" y="492" font-family="Unbounded" font-weight="700" font-size="92" letter-spacing="-4" fill="${YOLK}">you see.</text>
<text x="80" y="562" font-family="Geist Mono" font-weight="500" font-size="24" fill="#8A8178">Stock-paired token launches on Meteora · Solana</text>
<g transform="translate(796 120) scale(1.0)">
  <path d="${egg}" fill="${YOLK}" filter="url(#drop)"/>
  <g clip-path="url(#egg)"><rect width="210" height="262" fill="#000" fill-opacity="0.14"/><path d="${egg}" transform="translate(-18 -22)" fill="${YOLK}"/></g>
  <path d="M52 72 C 34 104, 32 150, 46 186" fill="none" stroke="#fff" stroke-opacity="0.6" stroke-width="13" stroke-linecap="round"/>
</g>
<rect x="760" y="440" width="282" height="52" rx="26" fill="none" stroke="${YOLK}" stroke-width="2"/>
<text x="901" y="474" text-anchor="middle" font-family="Geist Mono" font-weight="500" font-size="24" fill="${YOLK}">paired with NVDAx</text>
</svg>`;
};

function write(file: string, data: Buffer | string) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, data);
  console.log('wrote', path.relative(path.resolve(WEB, '..'), file));
}

const pub = (f: string) => path.join(WEB, 'public', f);
write(pub('brand/hatch-mark.svg'), markSvg(SHELL, YOLK)); // on Night
write(pub('brand/hatch-mark-light.svg'), markSvg(NIGHT, YOLK)); // on Shell
write(pub('brand/hatch-app-icon.svg'), appIconSvg(512));
write(pub('favicon.svg'), appIconSvg(64));
write(pub('favicon.ico'), ico([16, 32, 48].map((size) => ({ size, data: png(appIconSvg(size), size) }))));
write(pub('apple-touch-icon.png'), png(appIconSvg(180).replace(/rx="\d+"/, 'rx="0"'), 180)); // iOS rounds the corners itself
write(pub('brand/icon-192.png'), png(appIconSvg(192), 192));
write(pub('brand/icon-512.png'), png(appIconSvg(512), 512));
write(pub('og.png'), png(ogSvg(), 1200));
for (const size of [16, 32, 48, 96, 128]) write(path.join(EXT, 'public/icon', `${size}.png`), png(appIconSvg(size), size));
