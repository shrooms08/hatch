// Read Hatch pool state straight from chain with the DBC SDK (no indexers).
import { Connection, PublicKey } from '@solana/web3.js';
import {
  DAMM_V2_MIGRATION_FEE_ADDRESS,
  DynamicBondingCurveClient,
  deriveDammV2PoolAddress,
  deriveDbcPoolAddress,
  getPriceFromSqrtPrice,
  type PoolConfig,
  type VirtualPool,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
import Decimal from 'decimal.js';
import BN from 'bn.js';
import { memoAsync } from '@/lib/cache/memoAsync';
import { feeScheduleOf, type FeeSchedule } from '@/lib/dbc/feeSchedule';
import { fetchMintInfo, rawToUi, type MintInfo } from '@/lib/solana/mint';
import { allConfigKeys, isLegacyConfig, presetForConfig, EMPTY_HATCH_CONFIGS, type HatchConfigs, type PresetId } from '@/lib/presets';

export type HatchStatus = 'INCUBATING' | 'ALMOST_HATCHED' | 'HATCHED';
export const ALMOST_HATCHED_AT = 0.8;

export const STATUS_LABEL: Record<HatchStatus, string> = {
  INCUBATING: 'Incubating',
  ALMOST_HATCHED: 'Almost hatched',
  HATCHED: 'Hatched',
};

export type HatchPool = {
  address: string;
  baseMint: string;
  configKey: string;
  presetId: PresetId | null;
  creator: string;
  quote: MintInfo;
  baseDecimals: number;
  /** Price of 1 base token in UI quote units (scaled multiplier applied). */
  price: Decimal;
  /** The curve's starting price (config sqrtStartPrice), same units as `price`. */
  startPrice: Decimal;
  /** Fixed token supply from the config (UI units); null for configs without a fixed supply. */
  totalSupply: Decimal | null;
  /** quoteReserve / migrationQuoteThreshold, clamped to [0, 1]. */
  progress: number;
  quoteReserveUi: Decimal;
  thresholdUi: Decimal;
  status: HatchStatus;
  isMigrated: boolean;
  dammV2Pool: string | null;
  /** Base-fee schedule from the pool's config (a decaying one is the "Sniper shield"). */
  feeSchedule: FeeSchedule;
  /** When trading opened (unix seconds for timestamp-activated configs). */
  activationPoint: string;
  /** True when the config is a legacy (pre-v2) config that is no longer used for launches. */
  legacyConfig: boolean;
  /** Creator's share of trading fees, in % (the rest goes to Hatch as partner). */
  creatorFeePct: number;
  /** The curve's own token accounts (never counted as holders). */
  baseVault: string;
  quoteVault: string;
  fees: {
    creatorQuote: Decimal;
    creatorBase: Decimal;
    partnerQuote: Decimal;
    partnerBase: Decimal;
    creatorQuoteRaw: string;
    creatorBaseRaw: string;
    /** Creator's all-time trading fees in the quote token (pool metrics x creator share, as the SDK's getPoolFeeBreakdown). */
    creatorEarnedQuote: Decimal;
    /** Earned minus unclaimed. Per-trade rounding makes the split approximate by a few raw units, so tiny values read as 0. */
    creatorClaimedQuote: Decimal;
  };
};

export function dbcClient(connection: Connection) {
  return new DynamicBondingCurveClient(connection, 'confirmed');
}

const quoteInfoCache = new Map<string, Promise<MintInfo>>();
/** Mint info (decimals, program, scaled multiplier) once per mint per session: it never changes. */
export function cachedMintInfo(connection: Connection, mint: string) {
  return memoAsync(quoteInfoCache, mint, () => fetchMintInfo(connection, mint));
}

export function statusFor(progress: number, isMigrated: boolean): HatchStatus {
  if (isMigrated) return 'HATCHED';
  return progress >= ALMOST_HATCHED_AT ? 'ALMOST_HATCHED' : 'INCUBATING';
}

const configCache = new Map<string, Promise<PoolConfig | null>>();
/** A DBC config, read once per session (configs are immutable once created). */
export function cachedPoolConfig(connection: Connection, configKey: string): Promise<PoolConfig | null> {
  return memoAsync(configCache, configKey, () => dbcClient(connection).state.getPoolConfig(configKey));
}

/** Rounding slack, in raw quote units, below which "claimed" reads as 0 (the split rounds per trade). */
const CLAIM_ROUNDING_SLACK = 16;

/** Creator's earned (all time) and claimed trading fees, in quote UI units, from the pool's own counters. */
export function creatorEarnings(totalTradingQuoteFee: BN, creatorPct: number, unclaimedQuote: BN, quote: MintInfo) {
  const earned = creatorPct > 0 ? totalTradingQuoteFee.mul(new BN(creatorPct)).div(new BN(100)) : new BN(0);
  let claimed = earned.sub(unclaimedQuote);
  if (claimed.lten(CLAIM_ROUNDING_SLACK)) claimed = new BN(0);
  const shownEarned = BN.max(earned, unclaimedQuote);
  return { creatorEarnedQuote: rawToUi(shownEarned, quote), creatorClaimedQuote: rawToUi(claimed, quote) };
}

export async function describePool(
  connection: Connection,
  address: PublicKey,
  pool: VirtualPool,
  config: PoolConfig,
  hc: HatchConfigs = EMPTY_HATCH_CONFIGS
): Promise<HatchPool> {
  const s = pool.poolState;
  const quote = await cachedMintInfo(connection, config.quoteMint.toBase58());
  const baseDecimals = config.tokenDecimal;
  const rawPrice = getPriceFromSqrtPrice(s.sqrtPrice, baseDecimals, quote.decimals);
  const progress = Math.min(
    1,
    Math.max(0, new Decimal(s.quoteReserve.toString()).div(config.migrationQuoteThreshold.toString()).toNumber())
  );
  const isMigrated = s.isMigrated === 1;
  const dammConfig = DAMM_V2_MIGRATION_FEE_ADDRESS[config.migrationFeeOption];
  const baseUnit = { decimals: baseDecimals, multiplier: 1 };

  return {
    address: address.toBase58(),
    baseMint: s.baseMint.toBase58(),
    configKey: s.config.toBase58(),
    presetId: presetForConfig(hc, s.config.toBase58()),
    creator: s.creator.toBase58(),
    quote,
    baseDecimals,
    price: new Decimal(rawPrice.toString()).mul(quote.multiplier),
    startPrice: new Decimal(getPriceFromSqrtPrice(config.sqrtStartPrice, baseDecimals, quote.decimals).toString()).mul(quote.multiplier),
    totalSupply: config.fixedTokenSupplyFlag === 1 ? rawToUi(config.postMigrationTokenSupply, baseUnit) : null,
    progress,
    quoteReserveUi: rawToUi(s.quoteReserve, quote),
    thresholdUi: rawToUi(config.migrationQuoteThreshold, quote),
    status: statusFor(progress, isMigrated),
    isMigrated,
    dammV2Pool:
      isMigrated && config.migrationOption === 1 && dammConfig
        ? deriveDammV2PoolAddress(dammConfig, s.baseMint, config.quoteMint).toBase58()
        : null,
    feeSchedule: feeScheduleOf(config),
    activationPoint: s.activationPoint.toString(),
    legacyConfig: isLegacyConfig(hc, s.config.toBase58()),
    creatorFeePct: config.creatorTradingFeePercentage,
    baseVault: s.baseVault.toBase58(),
    quoteVault: s.quoteVault.toBase58(),
    fees: {
      creatorQuote: rawToUi(s.creatorQuoteFee, quote),
      creatorBase: rawToUi(s.creatorBaseFee, baseUnit),
      partnerQuote: rawToUi(s.partnerQuoteFee, quote),
      partnerBase: rawToUi(s.partnerBaseFee, baseUnit),
      creatorQuoteRaw: s.creatorQuoteFee.toString(),
      creatorBaseRaw: s.creatorBaseFee.toString(),
      ...creatorEarnings(s.metrics.totalTradingQuoteFee, config.creatorTradingFeePercentage, s.creatorQuoteFee, quote),
    },
  };
}

/** Pool for a base mint, or null if there is no DBC pool for it. */
export async function fetchHatchPoolByMint(
  connection: Connection,
  baseMint: string,
  hc: HatchConfigs = EMPTY_HATCH_CONFIGS
): Promise<HatchPool | null> {
  const client = dbcClient(connection);
  const mint = new PublicKey(baseMint);
  // Hatch pools sit at a PDA of (quote mint, base mint, config): plain account reads, no program scan.
  // Link coins (their own config, not listed with launches) are found the same way.
  for (const key of [...allConfigKeys(hc), ...(hc.link ? [hc.link.config, ...(hc.link.legacyConfigs ?? [])] : [])]) {
    const config = await client.state.getPoolConfig(key);
    if (!config) continue;
    const address = deriveDbcPoolAddress(config.quoteMint, mint, new PublicKey(key));
    const pool = await client.state.getPool(address);
    if (pool) return describePool(connection, address, pool, config, hc);
  }
  // Other configs: getProgramAccounts scan (some RPCs intermittently return nothing, so retry once).
  const found = (await client.state.getPoolByBaseMint(mint)) ?? (await client.state.getPoolByBaseMint(mint));
  if (!found) return null;
  const config = await client.state.getPoolConfig(found.account.poolState.config);
  if (!config) return null;
  return describePool(connection, found.publicKey, found.account, config, hc);
}

/**
 * All pools under Hatch's config keys (optionally only those created by `creator`).
 * `publicList` drops HIDDEN_MINTS (test tokens); direct token pages are unaffected.
 */
export async function fetchHatchPools(
  connection: Connection,
  hc: HatchConfigs,
  opts: { creator?: string; publicList?: boolean } = {}
): Promise<HatchPool[]> {
  const client = dbcClient(connection);
  const configKeys = allConfigKeys(hc);
  const configs = new Map<string, PoolConfig>();
  await Promise.all(
    configKeys.map(async (k) => {
      const c = await client.state.getPoolConfig(k);
      if (c) configs.set(k, c);
    })
  );

  // getProgramAccounts scans: some RPCs intermittently return an empty list, so an empty result is retried once.
  const scan = async <T,>(q: () => Promise<T[]>) => {
    const first = await q();
    return first.length ? first : q();
  };
  const pools = opts.creator
    ? (await scan(() => client.state.getPoolsByCreator(opts.creator!))).filter((p) =>
        configs.has(p.account.poolState.config.toBase58())
      )
    : (await Promise.all([...configs.keys()].map((k) => scan(() => client.state.getPoolsByConfig(k))))).flat();

  const described = await Promise.all(
    pools.map((p) =>
      describePool(
        connection,
        p.publicKey,
        p.account,
        configs.get(p.account.poolState.config.toBase58())!,
        hc
      )
    )
  );
  const visible = opts.publicList ? described.filter((d) => !hc.hiddenMints.includes(d.baseMint)) : described;
  // Newest-looking first is not available without timestamps; sort by progress, hatched last.
  return visible.sort((a, b) => Number(a.isMigrated) - Number(b.isMigrated) || b.progress - a.progress);
}
