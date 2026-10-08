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
    quoteMint: '', // per stock: see stockPreset() and STOCK_CONFIGS
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

/** Preset -> DBC config key for the non-stock presets (from POOL_CONFIGS). */
export type PresetConfigMap = Partial<Record<PresetId, string>>;

/** One tokenized stock Hatch can pair with on this network (from STOCK_CONFIGS). */
export type StockInfo = {
  ticker: string; // e.g. "NVDA"
  config: string; // DBC config key quoted in this stock
  quoteMint: string; // the xStock mint (Token-2022)
  symbol: string; // e.g. "NVDAx"
  name: string; // e.g. "NVIDIA"
};
export type StockMap = Record<string, StockInfo>;

/** Everything the app needs to know about the current network's launch configs (/api/presets). */
export type HatchConfigs = {
  network: string;
  configs: PresetConfigMap;
  stocks: StockMap;
  /** Mints hidden from public lists (their token pages still work by direct link). */
  hiddenMints: string[];
  /** Test launches: listed, but badged "Test launch". */
  testMints: string[];
};

export const EMPTY_HATCH_CONFIGS: HatchConfigs = { network: '', configs: {}, stocks: {}, hiddenMints: [], testMints: [] };

/** Every config key Hatch launches under (deduped: on mainnet AI_AGENT reuses the MEME config). */
export function allConfigKeys(hc: HatchConfigs): string[] {
  const keys = [...Object.values(hc.configs), ...Object.values(hc.stocks).map((s) => s.config)].filter(Boolean) as string[];
  return [...new Set(keys)];
}

export function presetForConfig(hc: HatchConfigs, configKey: string): PresetId | null {
  if (Object.values(hc.stocks).some((s) => s.config === configKey)) return 'STOCK';
  const hit = (Object.entries(hc.configs) as [PresetId, string][]).find(([, k]) => k === configKey);
  return hit ? hit[0] : null;
}

export function stockForConfig(hc: HatchConfigs, configKey: string): StockInfo | null {
  return Object.values(hc.stocks).find((s) => s.config === configKey) ?? null;
}

/** The STOCK preset's copy for a specific stock. */
export function stockPreset(stock: Pick<StockInfo, 'symbol' | 'name' | 'quoteMint'> | null | undefined): Preset {
  if (!stock) return PRESETS.STOCK;
  return {
    ...PRESETS.STOCK,
    description: `A token whose pool is priced in tokenized ${stock.name} (${stock.symbol}).`,
    quoteMint: stock.quoteMint,
    quoteSymbol: stock.symbol,
    explainer: [
      `People buy your token with tokenized ${stock.name} (${stock.symbol}) instead of SOL, and every purchase nudges the price up.`,
      `Once enough ${stock.symbol} has come in, your token "hatches" into a full trading pool paired with ${stock.symbol}; every trade pays a 1% fee, split evenly between you and Hatch.`,
      `This token is not the stock. Its pool holds tokenized ${stock.name}. The stock token's issuer can pause transfers.`,
    ],
  };
}
