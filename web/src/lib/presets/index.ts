// Hatch launch presets (client-safe). Config keys are NOT here: they live in the server-side
// POOL_CONFIGS allowlist and are exposed read-only through /api/presets.

export const PRESET_IDS = ['MEME', 'STOCK', 'AI_AGENT'] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export const WSOL_MINT = 'So11111111111111111111111111111111111111112';

export type Preset = {
  id: PresetId;
  label: string;
  description: string;
  quoteMint: string;
  quoteSymbol: string;
  /** Display default; trading always reads decimals from the mint on-chain. */
  quoteDecimals: number;
  explainer: string[];
};

export const PRESETS: Record<PresetId, Preset> = {
  MEME: {
    id: 'MEME',
    label: 'Meme',
    description: 'A fun community token bought with SOL.',
    quoteMint: WSOL_MINT,
    quoteSymbol: 'SOL',
    quoteDecimals: 9,
    explainer: [
      'People buy your token with SOL, and every purchase nudges the price up, so early buyers pay the least.',
      'Once enough SOL has come in, your token "hatches" into a full trading pool on Meteora.',
      'Every trade pays a 1% fee, split evenly between you (the creator) and Hatch.',
    ],
  },
  STOCK: {
    id: 'STOCK',
    label: 'Stock-paired',
    description: 'A token whose pool is priced in tokenized NVIDIA (NVDAx).',
    quoteMint: process.env.NEXT_PUBLIC_STOCK_QUOTE_MINT ?? '',
    quoteSymbol: 'NVDAx',
    quoteDecimals: 8,
    explainer: [
      'People buy your token with tokenized NVIDIA (NVDAx) instead of SOL, and every purchase nudges the price up.',
      'Once enough NVDAx has come in, your token "hatches" into a full trading pool paired with NVDAx; every trade pays a 1% fee, split evenly between you and Hatch.',
      "This token is not the stock. Its pool holds tokenized NVIDIA. The stock token's issuer can pause transfers.",
    ],
  },
  AI_AGENT: {
    id: 'AI_AGENT',
    label: 'AI agent',
    description: 'A token for an AI agent, with a gentler price curve and creator-first fees.',
    quoteMint: WSOL_MINT,
    quoteSymbol: 'SOL',
    quoteDecimals: 9,
    explainer: [
      'People buy your token with SOL; the price climbs more gently than a meme launch, so supporters can keep buying at fair prices for longer.',
      'Once enough SOL has come in, your token "hatches" into a full trading pool on Meteora.',
      'You keep most of the fees: 80% of every 1% trading fee goes to you, the rest to Hatch.',
    ],
  },
};

/** Accepts "MEME", "stock", "ai-agent", "ai_agent"... Returns null when unknown. */
export function parsePresetId(value: unknown): PresetId | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toUpperCase().replace(/-/g, '_');
  return (PRESET_IDS as readonly string[]).includes(v) ? (v as PresetId) : null;
}

/** Shape returned by /api/presets. */
export type PresetConfigMap = Partial<Record<PresetId, string>>;

export function presetForConfig(configs: PresetConfigMap, configKey: string): PresetId | null {
  const hit = (Object.entries(configs) as [PresetId, string][]).find(([, k]) => k === configKey);
  return hit ? hit[0] : null;
}
