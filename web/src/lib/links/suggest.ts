// Coin name and ticker for a link: sanitizing what people type, and a deterministic suggestion from the
// link's metadata (no AI call, so the same link always gets the same suggestion).
export const LINK_NAME_MAX = 32;
export const LINK_TICKER_MAX = 10;
export const LINK_TICKER_MIN = 2;

const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'by', 'is', 'are', 'was', 'be', 'it', 'this', 'that', 'my', 'your', 'our', 'i', 'we', 'you', 'from', 'as', 'just', 'so', 'how', 'why', 'what', 'official', 'video', 'feat', 'ft', 'vs']);

/** Name: printable letters, digits, spaces and . , ' & ! ? - ; collapsed spaces; at most 32 chars. */
export function sanitizeName(input: unknown): string {
  const s = String(input ?? '')
    .normalize('NFKC')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^\p{L}\p{N} .,'&!?-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return [...s].slice(0, LINK_NAME_MAX).join('').trim();
}

/** Ticker: A-Z and 0-9 only, at most 10. */
export function sanitizeTicker(input: unknown): string {
  return String(input ?? '')
    .normalize('NFKD')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, LINK_TICKER_MAX);
}

export const isValidName = (n: string) => n.length >= 1 && n.length <= LINK_NAME_MAX && n === sanitizeName(n);
export const isValidTicker = (t: string) => new RegExp(`^[A-Z0-9]{${LINK_TICKER_MIN},${LINK_TICKER_MAX}}$`).test(t);

const titleCase = (w: string) => (w.length <= 3 && w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1).toLowerCase());

/** e.g. "Rick Astley - Never Gonna Give You Up" -> { name: "Rick Astley Never Gonna", ticker: "RICK" }. */
export function suggestCoin(source: { title?: string | null; fallback: string }): { name: string; ticker: string } {
  const text = sanitizeName(`${source.title ?? ''}`.slice(0, 300)) || sanitizeName(source.fallback) || 'Link Coin';
  const all = text.split(/[\s._-]+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
  const keep = all.filter((w) => !STOP.has(w.toLowerCase()));
  const picked = (keep.length ? keep : all).slice(0, 4);
  let name = '';
  for (const w of picked.map(titleCase)) {
    if ((name ? `${name} ${w}` : w).length > LINK_NAME_MAX) break;
    name = name ? `${name} ${w}` : w;
  }
  name = name || 'Link Coin';
  const ascii = picked.map((w) => sanitizeTicker(w)).filter(Boolean);
  const first = ascii[0] ?? '';
  let ticker = first.length >= 3 ? first.slice(0, 6) : ascii.map((w) => w[0]).join('').slice(0, 6);
  if (ticker.length < LINK_TICKER_MIN) ticker = sanitizeTicker(source.fallback).slice(0, 6);
  if (ticker.length < LINK_TICKER_MIN) ticker = 'LINK';
  return { name, ticker };
}
