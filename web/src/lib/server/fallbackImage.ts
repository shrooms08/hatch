// Server-only: the image used when a launch has none. A 512x512 PNG in Hatch colours: a Yolk egg on
// Night with the ticker in bold Shell text, plus "paired with NVDAx" for stock-paired launches.
import { createHash } from 'node:crypto';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { uploadToR2 } from '@/lib/server/r2';

const NIGHT = '#120E0B';
const YOLK = '#F2A93B';
const SHELL = '#F6EEDC';
const FONT_FILE = path.join(process.cwd(), 'assets/fonts/ArchivoBlack-Regular.ttf'); // SIL OFL, see OFL.txt
const FONT = 'Archivo Black';

/** Path segment for generated images; the extension leaves these out of launch links (the server re-renders). */
export const FALLBACK_PREFIX = 'images/fallback/';

export const isFallbackUrl = (url: string) => url.includes(`/${FALLBACK_PREFIX}`);

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function fallbackSvg(symbol: string, pairedWith?: string | null): string {
  const ticker = esc(symbol.toUpperCase().slice(0, 10) || 'HATCH');
  // Fit the ticker inside the egg's widest part (~300px); Archivo Black caps run ~0.9em wide.
  const size = Math.round(Math.min(120, 280 / (ticker.length * 0.92)));
  const text = (fill: string, dx = 0, dy = 0, opacity = 1) =>
    `<text x="${256 + dx}" y="${300 + dy}" font-family="${FONT}" font-size="${size}" fill="${fill}" fill-opacity="${opacity}" text-anchor="middle" dominant-baseline="central">${ticker}</text>`;
  const paired = pairedWith
    ? `<text x="256" y="490" font-family="${FONT}" font-size="22" fill="${SHELL}" fill-opacity="0.85" text-anchor="middle">paired with ${esc(pairedWith)}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<rect width="512" height="512" fill="${NIGHT}"/>
<path d="M256 52 C 352 52 418 210 418 300 C 418 398 346 458 256 458 C 166 458 94 398 94 300 C 94 210 160 52 256 52 Z" fill="${YOLK}"/>
${text(NIGHT, 0, 4, 0.35)}
${text(SHELL)}
${paired}
</svg>`;
}

export function renderFallbackPng(symbol: string, pairedWith?: string | null): Buffer {
  const resvg = new Resvg(fallbackSvg(symbol, pairedWith), {
    fitTo: { mode: 'width', value: 512 },
    font: { fontFiles: [FONT_FILE], loadSystemFonts: false, defaultFontFamily: FONT },
  });
  return Buffer.from(resvg.render().asPng());
}

/** Renders and uploads to R2 under a content-derived key (same ticker + pairing reuses one object). */
export async function uploadFallbackImage(symbol: string, pairedWith?: string | null): Promise<string> {
  const id = createHash('sha256').update(`v1|${symbol}|${pairedWith ?? ''}`).digest('hex').slice(0, 24);
  return uploadToR2(`${FALLBACK_PREFIX}${id}.png`, renderFallbackPng(symbol, pairedWith), 'image/png');
}
