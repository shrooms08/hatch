// Server-only: a token's share card. getTokenCard() reads the pool + metadata (cached 5 min per mint);
// renderTokenCardPng() draws the 1200x630 Open Graph image (design/v1 tokens, same fonts and mark as
// the generated token art).
import path from 'node:path';
import { Connection, PublicKey } from '@solana/web3.js';
import { Resvg } from '@resvg/resvg-js';
import { serverRpcUrl } from '@/lib/config/network';
import { fetchHatchPoolByMint } from '@/lib/dbc/pool';
import { hasSniperShield } from '@/lib/dbc/feeSchedule';
import { fetchOnChainMetadata, pickMetadataJson } from '@/lib/metadata/token';
import { stockForConfig, type PresetId } from '@/lib/presets';
import { loadHatchConfigs } from '@/lib/server/presets';
import { isFallbackUrl, renderFallbackPng, toneFor } from '@/lib/server/fallbackImage';
import { safeFetchBytes } from '@/lib/server/safeFetch';

export type TokenCard = {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  image: string | null;
  /** null: not a Hatch pool (or no pool). */
  preset: PresetId | null;
  /** Quote token of a stock launch, e.g. "NVDAx"; and its ticker/name, e.g. "NVDA" / "NVIDIA". */
  paired: string | null;
  stockTicker: string | null;
  stockName: string | null;
  shield: boolean;
  /** 0-100 */
  progressPct: number | null;
  hatched: boolean;
  test: boolean;
};

const TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; card: Promise<TokenCard | null> }>();

/** Pool + metadata for a mint, cached 5 minutes (failures are not cached). null: no metadata. */
export function getTokenCard(mint: string): Promise<TokenCard | null> {
  new PublicKey(mint); // throws on a bad address
  const hit = cache.get(mint);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.card;
  // Failures and "no metadata yet" (a launch seconds old) are not cached.
  const card: Promise<TokenCard | null> = loadTokenCard(mint).then(
    (c) => {
      if (!c && cache.get(mint)?.card === card) cache.delete(mint);
      return c;
    },
    (e) => {
      if (cache.get(mint)?.card === card) cache.delete(mint);
      throw e;
    }
  );
  cache.set(mint, { at: Date.now(), card });
  if (cache.size > 2000) for (const [k, v] of cache) if (Date.now() - v.at >= TTL_MS) cache.delete(k);
  return card;
}

async function loadTokenCard(mint: string): Promise<TokenCard | null> {
  const connection = new Connection(serverRpcUrl(), 'confirmed');
  const hc = loadHatchConfigs();
  const [md, pool] = await Promise.all([fetchOnChainMetadata(connection, mint), fetchHatchPoolByMint(connection, mint, hc).catch((): null => null)]);
  if (!md) return null;
  let json: ReturnType<typeof pickMetadataJson> = null;
  try {
    json = pickMetadataJson(JSON.parse((await safeFetchBytes(md.uri, 256 * 1024)).toString('utf8')));
  } catch {
    /* off-chain JSON is optional */
  }
  const stock = pool?.presetId === 'STOCK' ? stockForConfig(hc, pool.configKey) : null;
  return {
    mint,
    name: md.name || 'Unknown token',
    symbol: md.symbol || '',
    description: json?.description ?? '',
    image: json?.image ?? null,
    preset: pool?.presetId ?? null,
    paired: stock?.symbol ?? null,
    stockTicker: stock?.ticker ?? null,
    stockName: stock?.name ?? null,
    shield: !!pool && pool.presetId !== null && hasSniperShield(pool.feeSchedule),
    progressPct: pool ? Math.round(pool.progress * 10_000) / 100 : null,
    hatched: !!pool?.isMigrated,
    test: hc.testMints.includes(mint),
  };
}

// ---- rendering ----

const FONT_DIR = path.join(process.cwd(), 'assets/fonts'); // SIL OFL, see FONTS.md
const FONT_FILES = ['Unbounded-Bold.ttf', 'GeistMono-Medium.ttf', 'GeistMono-SemiBold.ttf'].map((f) => path.join(FONT_DIR, f));
const C = { night: '#120E0B', surface: '#1E1813', line: '#3A3029', ink: '#F6EEDC', ink2: '#C9BFB2', muted: '#8A8178', yolk: '#F2A93B', ember: '#E8572A', success: '#7BD389', info: '#8DB4FF', warning: '#FFBD57' };
const PRESET_LABEL: Record<PresetId, string> = { STOCK: 'Stock-paired', MEME: 'Meme', AI_AGENT: 'AI agent' };
const MARK =
  '<g transform="translate(-3.5 3.5)"><path d="M0 -40 L13.9 -5.6 A15 15 0 1 1 -13.9 -5.6 Z" transform="translate(24 40) rotate(45)" fill="#F6EEDC" stroke="#F6EEDC" stroke-width="5" stroke-linejoin="round"/><circle cx="24" cy="40" r="9" fill="#F2A93B"/><path d="M53 35 L61.5 26.5 M27.6 12.4 L36 4" stroke="#F6EEDC" stroke-width="6" stroke-linecap="round"/></g>';

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** PNG/JPEG/GIF/WebP by magic bytes; anything else is not embedded. */
function imageMime(b: Buffer): string | null {
  if (b.length < 12) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b.toString('ascii', 0, 3) === 'GIF') return 'image/gif';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/** The token's own image as a data URI, or the generated egg art (same as launches without an image). */
async function tokenImageDataUri(card: TokenCard): Promise<string> {
  if (card.image && !isFallbackUrl(card.image)) {
    try {
      const bytes = await safeFetchBytes(card.image, 2 * 1024 * 1024);
      const mime = imageMime(bytes);
      if (mime) return `data:${mime};base64,${bytes.toString('base64')}`;
    } catch {
      /* fall through to the generated art */
    }
  }
  return `data:image/png;base64,${renderFallbackPng(card.symbol || 'HATCH', card.paired).toString('base64')}`;
}

/** Pill chip in Geist Mono (0.6em advance): returns [svg, width]. */
function chip(x: number, y: number, label: string, o: { color: string; border: string; fill: string; accent?: string; accentColor?: string; dot?: string }): [string, number] {
  const fs = 18;
  const text = o.accent ? `${label} ` : label;
  const textW = (text.length + (o.accent?.length ?? 0)) * fs * 0.6;
  const pad = 18;
  const dotW = o.dot ? 20 : 0;
  const w = Math.round(textW + pad * 2 + dotW);
  const h = 42;
  const tx = x + pad + dotW;
  const svg = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="21" fill="${o.fill}" stroke="${o.border}" stroke-width="1.5"/>
${o.dot ? `<circle cx="${x + pad + 6}" cy="${y + h / 2}" r="6" fill="${o.dot}"/>` : ''}
<text x="${tx}" y="${y + 27}" font-family="Geist Mono" font-weight="500" font-size="${fs}" fill="${o.color}">${esc(text)}${o.accent ? `<tspan fill="${o.accentColor}">${esc(o.accent)}</tspan>` : ''}</text>`;
  return [svg, w];
}

const FONT_OPTS = { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: 'Geist Mono' };

/** Rendered width of one line of text (px), measured with the same fonts. */
function measureText(text: string, family: string, size: number, letterSpacing = 0): number {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="200"><text x="0" y="150" font-family="${family}" font-weight="700" font-size="${size}" letter-spacing="${letterSpacing}">${esc(text)}</text></svg>`;
  return new Resvg(svg, { font: FONT_OPTS }).getBBox()?.width ?? text.length * size * 0.8;
}

export function tokenCardSvg(card: TokenCard, imageHref: string): string {
  const name = clip(card.name, 22);
  // Fit the name in the 580px column: measured at 76px, scaled down to 40px, then squeezed if still too wide.
  const at76 = measureText(name, 'Unbounded', 76, -0.035 * 76);
  const nameFs = Math.max(40, Math.min(76, Math.floor((76 * 580) / Math.max(at76, 1))));
  const squeeze = (at76 * nameFs) / 76 > 580 ? ' textLength="580" lengthAdjust="spacingAndGlyphs"' : '';
  const tone = toneFor(card.symbol || 'HATCH');

  // Chips: preset (with its quote), sniper shield, test launch.
  let cx = 540;
  const chips: string[] = [];
  const add = ([svg, w]: [string, number]) => {
    chips.push(svg);
    cx += w + 12;
  };
  if (card.preset) {
    const dot = card.preset === 'STOCK' ? C.yolk : card.preset === 'AI_AGENT' ? C.info : C.ink;
    add(chip(cx, 150, PRESET_LABEL[card.preset], { color: C.ink2, border: C.line, fill: C.surface, accent: card.paired ?? 'SOL', accentColor: card.preset === 'STOCK' ? C.yolk : C.muted, dot }));
  }
  if (card.shield) add(chip(cx, 150, 'SNIPER SHIELD', { color: C.success, border: 'rgba(123,211,137,0.45)', fill: 'rgba(123,211,137,0.10)' }));
  if (card.test) add(chip(cx, 150, 'TEST LAUNCH', { color: C.warning, border: 'rgba(255,189,87,0.45)', fill: 'rgba(255,189,87,0.10)' }));

  const ticker = card.symbol ? `$${clip(card.symbol, 12)}` : '';
  const pairedLine = card.paired ? `paired with ${card.paired}` : card.preset ? 'hatched on Solana' : '';

  // Progress (Hatch pools only).
  let progress = '';
  if (card.progressPct != null && card.preset) {
    const pct = card.hatched ? 100 : Math.max(0, Math.min(100, card.progressPct));
    const big = card.hatched ? 'Hatched!' : `${pct < 1 ? pct.toFixed(2) : pct < 10 ? pct.toFixed(1) : Math.floor(pct)}%`;
    const color = card.hatched || pct >= 80 ? C.ember : C.yolk;
    const fillW = pct > 0 ? Math.max(14, Math.round((580 * pct) / 100)) : 0;
    progress = `<text x="540" y="434" font-family="Geist Mono" font-weight="600" font-size="16" letter-spacing="2.4" fill="${C.muted}">HATCHING PROGRESS</text>
<text x="540" y="508" font-family="Unbounded" font-weight="700" font-size="64" letter-spacing="-2.2" fill="${color}">${esc(big)}${card.hatched ? '' : `<tspan dx="16" font-family="Geist Mono" font-weight="500" font-size="22" letter-spacing="0" fill="${C.ink2}">to hatch</tspan>`}</text>
<rect x="540" y="532" width="580" height="14" rx="7" fill="${C.surface}" stroke="${C.line}" stroke-width="1"/>
${fillW ? `<rect x="540" y="532" width="${fillW}" height="14" rx="7" fill="${color}"/>` : ''}`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
<defs>
  <pattern id="dots" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="16" cy="16" r="2" fill="${C.ink}" fill-opacity="0.07"/></pattern>
  <radialGradient id="glow" cx="280" cy="340" r="380" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${tone}" stop-opacity="0.22"/><stop offset="1" stop-color="${tone}" stop-opacity="0"/></radialGradient>
  <clipPath id="art"><rect x="80" y="140" width="400" height="400" rx="48"/></clipPath>
  <filter id="drop" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#000" flood-opacity="0.55"/></filter>
</defs>
<rect width="1200" height="630" fill="${C.night}"/>
<rect width="1200" height="630" fill="url(#dots)"/>
<rect width="1200" height="630" fill="url(#glow)"/>
<g transform="translate(80 46) scale(0.62)">${MARK}</g>
<text x="128" y="82" font-family="Unbounded" font-weight="700" font-size="34" letter-spacing="-1" fill="${C.ink}">Hatch</text>
<text x="1120" y="80" text-anchor="end" font-family="Geist Mono" font-weight="500" font-size="18" fill="${C.muted}">hatchfun.vercel.app</text>
<rect x="80" y="140" width="400" height="400" rx="48" fill="${C.surface}" filter="url(#drop)"/>
<image x="80" y="140" width="400" height="400" preserveAspectRatio="xMidYMid slice" clip-path="url(#art)" href="${imageHref}" xlink:href="${imageHref}"/>
<rect x="80.75" y="140.75" width="398.5" height="398.5" rx="47.5" fill="none" stroke="${C.ink}" stroke-opacity="0.12" stroke-width="1.5"/>
${chips.join('\n')}
<text x="540" y="${262 + Math.round(nameFs * 0.35)}" font-family="Unbounded" font-weight="700" font-size="${nameFs}" letter-spacing="${(-0.035 * nameFs).toFixed(2)}"${squeeze} fill="${C.ink}">${esc(name)}</text>
<text x="540" y="352" font-family="Geist Mono" font-weight="500" font-size="26" fill="${C.muted}">${esc(ticker)}${pairedLine ? `<tspan dx="${ticker ? 14 : 0}" fill="${C.muted}">${ticker ? '·' : ''}</tspan><tspan dx="${ticker ? 14 : 0}" fill="${card.paired ? C.yolk : C.muted}">${esc(pairedLine)}</tspan>` : ''}</text>
${progress}
</svg>`;
}

export async function renderTokenCardPng(card: TokenCard): Promise<Buffer> {
  const resvg = new Resvg(tokenCardSvg(card, await tokenImageDataUri(card)), {
    fitTo: { mode: 'width', value: 1200 },
    font: FONT_OPTS,
  });
  return Buffer.from(resvg.render().asPng());
}

/** og:title / og:description for a token page. */
export function tokenCardMeta(card: TokenCard): { title: string; description: string } {
  const ticker = card.symbol ? `$${card.symbol}` : '';
  const title = `${card.name}${ticker ? ` (${ticker})` : ''} on Hatch`;
  const what =
    card.preset === 'STOCK'
      ? `A token whose pool is priced in tokenized ${card.stockName ?? 'stock'} (${card.paired}). Pay with SOL or ${card.paired}.`
      : card.preset === 'AI_AGENT'
        ? 'An AI agent token on a gentler curve with creator-first fees, bought with SOL.'
        : card.preset === 'MEME'
          ? 'A community meme token, bought with SOL.'
          : 'A token on Solana.';
  const progress = !card.preset
    ? ''
    : card.hatched
      ? ' Hatched: now trading in a full Meteora pool.'
      : card.progressPct != null
        ? ` ${card.progressPct < 1 ? card.progressPct.toFixed(2) : Math.floor(card.progressPct)}% to hatch into a Meteora pool.`
        : '';
  const shield = card.shield && !card.hatched ? ' Sniper shield on.' : '';
  return { title, description: `${what}${progress}${shield}` };
}
