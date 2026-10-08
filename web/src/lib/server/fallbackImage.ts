// Server-only: the image used when a launch has none (design/v1 "Generated token art").
// 512x512 PNG: Night + 32px dot field, HATCH mark, a glowing egg in one of six tones (seeded by the
// ticker, so the Hatch-a-token preview matches), the ticker in Unbounded 700 (118 -> 62px by length),
// and "paired with NVDAx" (stock) or "hatched on Solana" at the bottom.
import { createHash } from 'node:crypto';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { R2ObjectExistsError, publicR2Url, uploadToR2 } from '@/lib/server/r2';

const FONT_DIR = path.join(process.cwd(), 'assets/fonts'); // SIL OFL, see FONTS.md
const FONT_FILES = ['Unbounded-Bold.ttf', 'GeistMono-Medium.ttf', 'GeistMono-SemiBold.ttf'].map((f) => path.join(FONT_DIR, f));

/** Same six tones and hash as components/ds/TokenArt (client preview). */
const EGG_TONES = ['#F2A93B', '#E8572A', '#F6EEDC', '#7BD389', '#8DB4FF', '#FFBD57'];
export function toneFor(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return EGG_TONES[(h >>> 0) % EGG_TONES.length];
}
const tickerFontSize = (L: number) => (L <= 4 ? 118 : L === 5 ? 100 : L === 6 ? 86 : L === 7 ? 74 : 62);

/** Path segment for generated images; the extension leaves these out of launch links (the server re-renders). */
export const FALLBACK_PREFIX = 'images/fallback/';

export const isFallbackUrl = (url: string) => url.includes(`/${FALLBACK_PREFIX}`);

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Egg: 210x262 box at (151,70) with border-radius 50%/60% top, 50%/40% bottom.
const EGG = 'M151 227 A105 157 0 0 1 361 227 A105 105 0 0 1 151 227 Z';
const MARK =
  '<g transform="translate(-3.5 3.5)"><path d="M0 -40 L13.9 -5.6 A15 15 0 1 1 -13.9 -5.6 Z" transform="translate(24 40) rotate(45)" fill="#F6EEDC" stroke="#F6EEDC" stroke-width="5" stroke-linejoin="round"/><circle cx="24" cy="40" r="9" fill="#F2A93B"/><path d="M53 35 L61.5 26.5 M27.6 12.4 L36 4" stroke="#F6EEDC" stroke-width="6" stroke-linecap="round"/></g>';

export function fallbackSvg(symbol: string, pairedWith?: string | null): string {
  const raw = (symbol.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'HATCH');
  const ticker = esc(raw);
  const tone = toneFor(raw);
  const fs = tickerFontSize(raw.length);
  const footer = pairedWith
    ? (() => {
        const label = `paired with ${pairedWith}`;
        const w = Math.round(label.length * 21 * 0.6 + 44); // Geist Mono advance is 0.6em
        return `<rect x="${256 - w / 2}" y="441" width="${w}" height="42" rx="21" fill="none" stroke="#F2A93B" stroke-width="2"/>
<text x="256" y="469" text-anchor="middle" font-family="Geist Mono" font-weight="500" font-size="21" fill="#F2A93B">${esc(label)}</text>`;
      })()
    : `<text x="256" y="465" text-anchor="middle" font-family="Geist Mono" font-weight="500" font-size="21" letter-spacing="0.84" fill="#8A8178">hatched on Solana</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
<defs>
  <pattern id="dots" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="16" cy="16" r="2" fill="#F6EEDC" fill-opacity="0.10"/></pattern>
  <radialGradient id="glow" cx="256" cy="194.56" r="224" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${tone}" stop-opacity="0.2"/><stop offset="1" stop-color="${tone}" stop-opacity="0"/></radialGradient>
  <clipPath id="egg"><path d="${EGG}"/></clipPath>
  <filter id="drop" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="24" stdDeviation="24" flood-color="#000" flood-opacity="0.5"/></filter>
  <mask id="shine"><rect width="512" height="512" fill="#000"/><ellipse cx="218" cy="170" rx="28" ry="48" fill="#fff"/><ellipse cx="231" cy="170" rx="28" ry="48" fill="#000"/></mask>
</defs>
<rect width="512" height="512" fill="#120E0B"/>
<rect width="512" height="512" fill="url(#dots)"/>
<g transform="translate(36 34) scale(0.53125)">${MARK}</g>
<text x="80" y="58" font-family="Geist Mono" font-weight="600" font-size="20" letter-spacing="2.8" fill="#8A8178">HATCH</text>
<rect width="512" height="512" fill="url(#glow)"/>
<path d="${EGG}" fill="${tone}" filter="url(#drop)"/>
<g clip-path="url(#egg)"><rect x="151" y="70" width="210" height="262" fill="#000" fill-opacity="0.14"/><path d="${EGG}" transform="translate(-18 -22)" fill="${tone}"/></g>
<g transform="rotate(16 218 170)"><rect x="180" y="110" width="80" height="120" fill="#fff" fill-opacity="0.6" mask="url(#shine)"/></g>
<text x="256" y="${352 + Math.round(fs * 0.8)}" text-anchor="middle" font-family="Unbounded" font-weight="700" font-size="${fs}" letter-spacing="${(-0.035 * fs).toFixed(2)}" fill="#F6EEDC">${ticker}</text>
${footer}
</svg>`;
}

export function renderFallbackPng(symbol: string, pairedWith?: string | null): Buffer {
  const resvg = new Resvg(fallbackSvg(symbol, pairedWith), {
    fitTo: { mode: 'width', value: 512 },
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: 'Geist Mono' },
  });
  return Buffer.from(resvg.render().asPng());
}

/** Renders and uploads to R2 under a content-derived key (same ticker + pairing reuses one object). */
export async function uploadFallbackImage(symbol: string, pairedWith?: string | null): Promise<string> {
  const id = createHash('sha256').update(`v2|${symbol}|${pairedWith ?? ''}`).digest('hex').slice(0, 24);
  const key = `${FALLBACK_PREFIX}${id}.png`;
  try {
    return await uploadToR2(key, renderFallbackPng(symbol, pairedWith), 'image/png');
  } catch (e) {
    // Same ticker + pairing renders the same image: the existing object is the one we want.
    if (e instanceof R2ObjectExistsError) return publicR2Url(key);
    throw e;
  }
}
