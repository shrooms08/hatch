// Server-only: the launch allowlist for the current network.
//   POOL_CONFIGS  = {"MEME":"<config>","AI_AGENT":"<config>"}   (a "STOCK" entry is accepted for older envs)
//   STOCK_CONFIGS = {"NVDA":{"config":"<config>","quoteMint":"<xStock mint>","symbol":"NVDAx","name":"NVIDIA"}}
//   HIDDEN_MINTS  = comma-separated mints hidden from public lists
//   TEST_MINTS    = comma-separated mints shown with a "Test launch" badge
import { PublicKey } from '@solana/web3.js';
import { NETWORK } from '@/lib/config/network';
import { PRESET_IDS, type HatchConfigs, type PresetConfigMap, type PresetId, type StockInfo, type StockMap } from '@/lib/presets';

export class PresetError extends Error {}

function pubkey(value: unknown, where: string): string {
  try {
    if (typeof value !== 'string' || !value) throw new Error();
    return new PublicKey(value).toBase58();
  } catch {
    throw new PresetError(`${where} is not a valid public key`);
  }
}

function parseJson(name: string): Record<string, unknown> | null {
  const raw = process.env[name];
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object') throw new Error();
    return v as Record<string, unknown>;
  } catch {
    throw new PresetError(`${name} is not valid JSON`);
  }
}

function loadPoolConfigs(): PresetConfigMap {
  const parsed = parseJson('POOL_CONFIGS') ?? {};
  const out: PresetConfigMap = {};
  for (const id of PRESET_IDS) {
    if (typeof parsed[id] === 'string' && parsed[id]) out[id] = pubkey(parsed[id], `POOL_CONFIGS.${id}`);
  }
  return out;
}

function loadStockConfigs(poolConfigs: PresetConfigMap): StockMap {
  const parsed = parseJson('STOCK_CONFIGS');
  const out: StockMap = {};
  if (parsed) {
    for (const [rawTicker, v] of Object.entries(parsed)) {
      const ticker = rawTicker.toUpperCase();
      if (!/^[A-Z]{1,6}(\.[A-Z])?$/.test(ticker)) throw new PresetError(`STOCK_CONFIGS: bad ticker ${rawTicker}`);
      const e = (v ?? {}) as Record<string, unknown>;
      const symbol = typeof e.symbol === 'string' && e.symbol ? e.symbol : `${ticker}x`;
      out[ticker] = {
        ticker,
        config: pubkey(e.config, `STOCK_CONFIGS.${ticker}.config`),
        quoteMint: pubkey(e.quoteMint, `STOCK_CONFIGS.${ticker}.quoteMint`),
        symbol,
        name: typeof e.name === 'string' && e.name ? e.name : ticker,
      } satisfies StockInfo;
    }
    return out;
  }
  // Older envs: a single POOL_CONFIGS.STOCK + NEXT_PUBLIC_STOCK_QUOTE_MINT meant NVDA.
  const legacyMint = process.env.NEXT_PUBLIC_STOCK_QUOTE_MINT;
  if (poolConfigs.STOCK && legacyMint) {
    out.NVDA = { ticker: 'NVDA', config: poolConfigs.STOCK, quoteMint: pubkey(legacyMint, 'NEXT_PUBLIC_STOCK_QUOTE_MINT'), symbol: 'NVDAx', name: 'NVIDIA' };
  }
  return out;
}

function loadMintList(name: 'HIDDEN_MINTS' | 'TEST_MINTS'): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)
    .map((m) => pubkey(m, `${name} entry ${m.slice(0, 6)}…`));
}

export function loadHatchConfigs(): HatchConfigs {
  const configs = loadPoolConfigs();
  const stocks = loadStockConfigs(configs);
  delete configs.STOCK; // STOCK launches go through STOCK_CONFIGS (per ticker)
  return { network: NETWORK, configs, stocks, hiddenMints: loadMintList('HIDDEN_MINTS'), testMints: loadMintList('TEST_MINTS') };
}

/** Config for a launch. STOCK needs a ticker that exists in STOCK_CONFIGS on this network. */
export function configKeyFor(preset: PresetId, stockTicker?: string | null): PublicKey {
  const hc = loadHatchConfigs();
  if (preset === 'STOCK') {
    const ticker = (stockTicker ?? '').toUpperCase();
    const stock = hc.stocks[ticker];
    if (!ticker) throw new PresetError('Pick which stock to pair with');
    if (!stock) throw new PresetError(`Stock-paired launches for ${ticker} are not available on this network yet`);
    return new PublicKey(stock.config);
  }
  const key = hc.configs[preset];
  if (!key) throw new PresetError(`Preset ${preset} is not enabled on this server`);
  return new PublicKey(key);
}
