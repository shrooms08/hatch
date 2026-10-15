// Server-only: the launch allowlist for the current network.
//   POOL_CONFIGS  = {"MEME":"<config>","AI_AGENT":"<config>"}   (each preset needs its own config;
//                   a "STOCK" entry is accepted for older envs)
//   STOCK_CONFIGS = {"NVDA":{"config":"<config>","quoteMint":"<xStock mint>","symbol":"NVDAx","name":"NVIDIA"}}
//   HIDDEN_MINTS  = comma-separated mints hidden from public lists
//   TEST_MINTS    = comma-separated mints shown with a "Test launch" badge
//   LEGACY_CONFIGS = older configs whose pools stay recognized (never used for new launches)
import { PublicKey } from '@solana/web3.js';
import { NETWORK } from '@/lib/config/network';
import { PRESET_IDS, type HatchConfigs, type LegacyConfig, type PresetConfigMap, type PresetId, type StockInfo, type StockMap } from '@/lib/presets';

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
  // Each preset needs its own config: a preset that reuses another preset's config would promise a
  // curve it does not have (and blur pool labels), so it is left out. On mainnet the AI agent preset
  // stays hidden until it gets a dedicated config; add "AI_AGENT":"<config>" to POOL_CONFIGS to enable it.
  if (out.AI_AGENT && out.AI_AGENT === out.MEME) {
    if (!warnedShared) console.warn('POOL_CONFIGS.AI_AGENT reuses the MEME config; the AI agent preset is disabled until it has its own config.');
    warnedShared = true;
    delete out.AI_AGENT;
  }
  return out;
}

let warnedShared = false;

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

/** LEGACY_CONFIGS = [{"config":"<old config>","preset":"MEME"}, {"config":"<old>","preset":"STOCK","stock":"NVDA"}] */
function loadLegacyConfigs(): LegacyConfig[] {
  const raw = process.env.LEGACY_CONFIGS;
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PresetError('LEGACY_CONFIGS is not valid JSON');
  }
  if (!Array.isArray(parsed)) throw new PresetError('LEGACY_CONFIGS must be a JSON array');
  return parsed.map((e, i) => {
    const v = (e ?? {}) as Record<string, unknown>;
    const preset = String(v.preset ?? '') as PresetId;
    if (!(PRESET_IDS as readonly string[]).includes(preset)) throw new PresetError(`LEGACY_CONFIGS[${i}].preset must be one of ${PRESET_IDS.join(', ')}`);
    const stock = typeof v.stock === 'string' && v.stock ? v.stock.toUpperCase() : undefined;
    return { config: pubkey(v.config, `LEGACY_CONFIGS[${i}].config`), preset, ...(stock ? { stock } : {}) };
  });
}

export function loadHatchConfigs(): HatchConfigs {
  const configs = loadPoolConfigs();
  const stocks = loadStockConfigs(configs);
  delete configs.STOCK; // STOCK launches go through STOCK_CONFIGS (per ticker)
  return {
    network: NETWORK,
    configs,
    stocks,
    hiddenMints: loadMintList('HIDDEN_MINTS'),
    testMints: loadMintList('TEST_MINTS'),
    legacy: loadLegacyConfigs(),
    link: loadLinkConfig(),
  };
}

/** LINK_CONFIG + LINK_VAULT (both public keys): link coins are enabled only when both are set. */
function loadLinkConfig(): { config: string; vault: string } | null {
  const config = process.env.LINK_CONFIG?.trim();
  const vault = process.env.LINK_VAULT?.trim();
  if (!config || !vault) return null;
  return { config: pubkey(config, 'LINK_CONFIG'), vault: pubkey(vault, 'LINK_VAULT') };
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

/** Presets that can launch on this network: MEME/AI_AGENT with a config, STOCK with at least one stock. */
export function enabledPresets(hc: HatchConfigs): PresetId[] {
  return PRESET_IDS.filter((id) => (id === 'STOCK' ? Object.keys(hc.stocks).length > 0 : !!hc.configs[id]));
}
