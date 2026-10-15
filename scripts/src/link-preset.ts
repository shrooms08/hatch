// LINK-v1: the DBC config for "one official coin per link". Network-neutral (no RPC, no keys).
//   - SOL quote, Token-2022 base (6 decimals), fixed 1B supply, 20% of supply seeds DAMM v2 at graduation
//     (the MEME-v2 curve shape), fees collected in the quote token, creator/partner trading fees 50/50,
//     no migration fee, no pool creation fee.
//   - v2 "Sniper shield" fee scheduler: 50% at launch, exponential over 12 steps of 5 s, 1% from 60 s.
//   - Liquidity at migration is 100% PERMANENTLY LOCKED: creator 50% locked, partner 50% locked, nothing
//     withdrawable by either. Whoever holds a position can only claim its trading fees.
// Launch model: a fresh one-time keypair signs as poolCreator and the SAME transaction transfers the creator
// role to the Hatch Squads vault; the vault hands it to the link's owner once ownership is proven
// (link-proof-devnet.ts). There is no standing "Nest" key.
import { BaseFeeMode, TokenType, buildCurve, type ConfigParameters } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { base } from './presets.js'

export const LINK_SHIELD = { startingFeeBps: 5000, endingFeeBps: 100, numberOfPeriod: 12, totalDuration: 60 } as const
/** Mainnet keeper rule for SOL quotes: exactly 10 SOL. Devnet tests may pass a smaller threshold. */
export const LINK_THRESHOLD_SOL = 10

export function linkCurveV1(thresholdSol: number = LINK_THRESHOLD_SOL): ConfigParameters {
  const b = base(9)
  return buildCurve({
    ...b,
    token: { ...b.token, tokenType: TokenType.Token2022 },
    fee: { ...b.fee, baseFeeParams: { baseFeeMode: BaseFeeMode.FeeSchedulerExponential, feeSchedulerParam: { ...LINK_SHIELD } } },
    liquidityDistribution: {
      partnerLiquidityPercentage: 0,
      partnerPermanentLockedLiquidityPercentage: 50,
      creatorLiquidityPercentage: 0,
      creatorPermanentLockedLiquidityPercentage: 50,
    },
    percentageSupplyOnMigration: 20,
    migrationQuoteThreshold: thresholdSol,
  })
}

/** The LINK-v1 spec, field by field (numbers as strings where the config holds u64/u128). */
export function linkV1Spec(thresholdSol: number = LINK_THRESHOLD_SOL) {
  return {
    'poolFees.baseFee.baseFeeMode': 1, // FeeSchedulerExponential
    'poolFees.baseFee.cliffFeeNumerator': '500000000', // 50%
    'poolFees.baseFee.firstFactor': 12, // periods
    'poolFees.baseFee.secondFactor': '5', // seconds per period
    'poolFees.baseFee.thirdFactor': '2781', // reduction per period, bps (ends at 1%)
    dynamicFeeEnabled: true,
    collectFeeMode: 0, // quote token
    creatorTradingFeePercentage: 50,
    'migrationFee.feePercentage': 0,
    'migrationFee.creatorFeePercentage': 0,
    poolCreationFee: '0',
    migrationOption: 1, // DAMM v2
    activationType: 1, // timestamp
    tokenType: 1, // Token-2022
    tokenDecimal: 6,
    'tokenSupply.preMigrationTokenSupply': '1000000000000000',
    'tokenSupply.postMigrationTokenSupply': '1000000000000000',
    migrationQuoteThreshold: String(Math.round(thresholdSol * 1e9)),
    partnerLiquidityPercentage: 0,
    partnerPermanentLockedLiquidityPercentage: 50,
    creatorLiquidityPercentage: 0,
    creatorPermanentLockedLiquidityPercentage: 50,
    'lockedVesting.amountPerPeriod': '0',
    'lockedVesting.cliffUnlockAmount': '0',
    'partnerLiquidityVestingInfo.vestingPercentage': 0,
    'creatorLiquidityVestingInfo.vestingPercentage': 0,
  } as const
}

const at = (o: unknown, path: string): unknown => path.split('.').reduce<unknown>((v, k) => (v == null ? v : (v as Record<string, unknown>)[k]), o)
const norm = (v: unknown): unknown => (v != null && typeof v === 'object' && (v as { constructor?: { name?: string } }).constructor?.name === 'BN' ? (v as { toString(): string }).toString() : v)

/** Throws unless `curve` matches the LINK-v1 spec exactly. Returns the checked fields for printing. */
export function assertLinkV1Spec(curve: ConfigParameters, thresholdSol: number = LINK_THRESHOLD_SOL): Record<string, unknown> {
  const spec = linkV1Spec(thresholdSol)
  const got: Record<string, unknown> = {}
  const bad: string[] = []
  for (const [path, want] of Object.entries(spec)) {
    const have = path === 'dynamicFeeEnabled' ? at(curve, 'poolFees.dynamicFee') != null : norm(at(curve, path))
    got[path] = have
    if (String(have) !== String(want)) bad.push(`${path}: expected ${String(want)}, got ${String(have)}`)
  }
  if (bad.length) throw new Error(`Config does not match the LINK-v1 spec:\n  ${bad.join('\n  ')}`)
  return got
}
