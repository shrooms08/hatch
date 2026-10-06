// Read Hatch pool state straight from chain with the DBC SDK (no indexers).
import { Connection, PublicKey } from '@solana/web3.js';
import {
  DAMM_V2_MIGRATION_FEE_ADDRESS,
  DynamicBondingCurveClient,
  deriveDammV2PoolAddress,
  getPriceFromSqrtPrice,
  type PoolConfig,
  type VirtualPool,
} from '@meteora-ag/dynamic-bonding-curve-sdk';
import Decimal from 'decimal.js';
import { fetchMintInfo, rawToUi, type MintInfo } from '@/lib/solana/mint';
import { allConfigKeys, presetForConfig, EMPTY_HATCH_CONFIGS, type HatchConfigs, type PresetId } from '@/lib/presets';

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
  /** quoteReserve / migrationQuoteThreshold, clamped to [0, 1]. */
  progress: number;
  quoteReserveUi: Decimal;
  thresholdUi: Decimal;
  status: HatchStatus;
  isMigrated: boolean;
  dammV2Pool: string | null;
  fees: {
    creatorQuote: Decimal;
    creatorBase: Decimal;
    partnerQuote: Decimal;
    partnerBase: Decimal;
    creatorQuoteRaw: string;
    creatorBaseRaw: string;
  };
};

export function dbcClient(connection: Connection) {
  return new DynamicBondingCurveClient(connection, 'confirmed');
}

const quoteInfoCache = new Map<string, Promise<MintInfo>>();
function cachedMintInfo(connection: Connection, mint: string) {
  if (!quoteInfoCache.has(mint)) quoteInfoCache.set(mint, fetchMintInfo(connection, mint));
  return quoteInfoCache.get(mint)!;
}

export function statusFor(progress: number, isMigrated: boolean): HatchStatus {
  if (isMigrated) return 'HATCHED';
  return progress >= ALMOST_HATCHED_AT ? 'ALMOST_HATCHED' : 'INCUBATING';
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
    progress,
    quoteReserveUi: rawToUi(s.quoteReserve, quote),
    thresholdUi: rawToUi(config.migrationQuoteThreshold, quote),
    status: statusFor(progress, isMigrated),
    isMigrated,
    dammV2Pool:
      isMigrated && config.migrationOption === 1 && dammConfig
        ? deriveDammV2PoolAddress(dammConfig, s.baseMint, config.quoteMint).toBase58()
        : null,
    fees: {
      creatorQuote: rawToUi(s.creatorQuoteFee, quote),
      creatorBase: rawToUi(s.creatorBaseFee, baseUnit),
      partnerQuote: rawToUi(s.partnerQuoteFee, quote),
      partnerBase: rawToUi(s.partnerBaseFee, baseUnit),
      creatorQuoteRaw: s.creatorQuoteFee.toString(),
      creatorBaseRaw: s.creatorBaseFee.toString(),
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
  const found = await client.state.getPoolByBaseMint(new PublicKey(baseMint));
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

  const pools = opts.creator
    ? (await client.state.getPoolsByCreator(opts.creator)).filter((p) =>
        configs.has(p.account.poolState.config.toBase58())
      )
    : (await Promise.all([...configs.keys()].map((k) => client.state.getPoolsByConfig(k)))).flat();

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
