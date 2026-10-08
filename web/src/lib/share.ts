// Share copy for X (client-safe). One wording per preset; creators say "I just hatched", everyone else
// shares the token. The token page URL is passed separately so X shows its card (the OG image).
import type { PresetId } from '@/lib/presets';

export type ShareInfo = {
  symbol: string;
  preset: PresetId | null;
  /** e.g. "NVDA" for stock-paired launches. */
  stockTicker?: string | null;
  shield?: boolean;
  /** The sharer launched it (Hatched moment, or the creator's wallet on the token page). */
  creator?: boolean;
  /** 0-100, for viewers' shares. */
  progressPct?: number | null;
  hatched?: boolean;
};

const PRESET_LINE: Record<PresetId, (s: ShareInfo) => string> = {
  STOCK: (s) => `backed by tokenized ${s.stockTicker || 'stock'}`,
  MEME: () => 'a meme coin bought with SOL',
  AI_AGENT: () => 'an AI agent token with creator-first fees',
};

export function shareText(s: ShareInfo): string {
  const ticker = `$${s.symbol || 'TOKEN'}`;
  const what = s.preset ? `, ${PRESET_LINE[s.preset](s)}` : '';
  const shield = s.shield && !s.hatched ? ' Sniper shield on.' : '';
  if (s.creator) return `I just hatched ${ticker} on @MeteoraAG DBC${what}.${shield} Hatch yours:`;
  if (s.hatched) return `${ticker} hatched on @MeteoraAG DBC${what}. Now trading in a full Meteora pool:`;
  const pct = s.progressPct != null ? ` ${s.progressPct < 1 ? s.progressPct.toFixed(2) : Math.floor(s.progressPct)}% to hatch.` : '';
  return `${ticker} is hatching on @MeteoraAG DBC${what}.${pct}${shield} Help fill the egg:`;
}

/** X web intent with prefilled text and link. */
export const xIntentUrl = (text: string, url: string) => `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;

/** Absolute token page URL in the browser (the page's own origin). */
export const tokenPageUrl = (mint: string) => (typeof window === 'undefined' ? `/token/${mint}` : `${window.location.origin}/token/${mint}`);

/** Phantom's universal link that opens `url` in its in-app browser (mobile, no wallet extension). */
export const phantomBrowseUrl = (url: string, ref: string) => `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(ref)}`;
