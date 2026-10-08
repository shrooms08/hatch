// Server-only: launch copy for every enabled config, read from chain (threshold, fee schedule, creator
// share), cached 10 minutes. Served by /api/presets so the extension shows the launch form's text.
import { Connection } from '@solana/web3.js';
import { serverRpcUrl } from '@/lib/config/network';
import { dbcClient } from '@/lib/dbc/pool';
import { feeScheduleOf, feeSentence, formatFeePercent, hasSniperShield, shieldRange } from '@/lib/dbc/feeSchedule';
import { fetchMintInfo, rawToUi } from '@/lib/solana/mint';
import { formatAmount } from '@/lib/format/amount';
import { stockPreset, type HatchConfigs } from '@/lib/presets';
import { copyKey, howItWorksText, type PresetCopy } from '@/lib/presets/copy';

const TTL_MS = 10 * 60_000;
let cached: { at: number; sig: string; value: Promise<Record<string, PresetCopy>> } | null = null;

async function configCopy(connection: Connection, configKey: string, quoteSymbol: string, stockPaired: boolean, honest: string | null): Promise<PresetCopy | null> {
  const config = await dbcClient(connection).state.getPoolConfig(configKey);
  if (!config) return null;
  const quote = await fetchMintInfo(connection, config.quoteMint);
  const schedule = feeScheduleOf(config);
  const shield = hasSniperShield(schedule);
  const range = shield ? shieldRange(schedule) : null;
  const creatorPct = config.creatorTradingFeePercentage;
  const fee = feeSentence({ shield, start: range ? formatFeePercent(range.start) : undefined, end: range ? formatFeePercent(range.end) : undefined, creatorPct });
  const threshold = formatAmount(rawToUi(config.migrationQuoteThreshold, quote));
  return { howItWorks: howItWorksText({ quoteSymbol, stockPaired, threshold, fee }), fee, honest, shield, creatorPct };
}

/** Copy per enabled config: MEME, AI_AGENT, STOCK:<TICKER>. Configs that can't be read are left out. */
export function presetCopies(hc: HatchConfigs): Promise<Record<string, PresetCopy>> {
  const sig = JSON.stringify([hc.configs, hc.stocks]);
  if (cached && cached.sig === sig && Date.now() - cached.at < TTL_MS) return cached.value;
  const connection = new Connection(serverRpcUrl(), 'confirmed');
  const jobs: [string, Promise<PresetCopy | null>][] = [];
  for (const id of ['MEME', 'AI_AGENT'] as const) {
    const key = hc.configs[id];
    if (key) jobs.push([copyKey(id), configCopy(connection, key, 'SOL', false, null)]);
  }
  for (const s of Object.values(hc.stocks)) {
    const honest = stockPreset(s).explainer[2]?.replace("The stock token's issuer", 'The issuer') ?? null;
    jobs.push([copyKey('STOCK', s.ticker), configCopy(connection, s.config, s.symbol, true, honest)]);
  }
  const value = Promise.all(jobs.map(async ([k, p]) => [k, await p.catch((): null => null)] as const)).then((entries) => {
    const out = Object.fromEntries(entries.filter(([, v]) => v)) as Record<string, PresetCopy>;
    if (Object.keys(out).length < jobs.length && cached?.value === value) cached = null; // retry soon if a read failed
    return out;
  });
  cached = { at: Date.now(), sig, value };
  return value;
}
