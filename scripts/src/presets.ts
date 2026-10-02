// Hatch launch presets used on devnet. Curve parameters come from the SDK's buildCurve helper.
import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  MigrationFeeOption,
  MigrationOption,
  TokenAuthorityOption,
  TokenDecimal,
  TokenType,
  buildCurve,
  type BuildCurveBaseParams,
  type ConfigParameters,
} from '@meteora-ag/dynamic-bonding-curve-sdk'
import { PublicKey } from '@solana/web3.js'
import { WSOL_MINT, hasKeypair, loadKeypair, type PresetKey } from './lib.js'
import { NVDAX_DECIMALS } from './mock-stock.js'

export const BASE_DECIMALS = 6

export const PRESETS: Record<
  PresetKey,
  { label: string; quoteMint: () => PublicKey; quoteDecimals: number; quoteSymbol: string; token: { name: string; symbol: string; uri: string } }
> = {
  meme: {
    label: 'MEME (SOL quote)',
    quoteMint: () => WSOL_MINT,
    quoteDecimals: 9,
    quoteSymbol: 'SOL',
    token: { name: 'Hatch Meme Test', symbol: 'HMEME', uri: 'https://example.com/hatch/hmeme.json' },
  },
  stock: {
    label: 'STOCK (mock NVDAx quote, Token-2022)',
    quoteMint: () => {
      if (!hasKeypair('mock-nvdax-mint')) throw new Error('Mock NVDAx mint keypair missing. Run "pnpm mock-stock" first.')
      return loadKeypair('mock-nvdax-mint').publicKey
    },
    quoteDecimals: NVDAX_DECIMALS,
    quoteSymbol: 'NVDAx',
    token: { name: 'Hatch NVDA Test', symbol: 'HNVDA', uri: 'https://example.com/hatch/hnvda.json' },
  },
  agent: {
    label: 'AI AGENT (SOL quote)',
    quoteMint: () => WSOL_MINT,
    quoteDecimals: 9,
    quoteSymbol: 'SOL',
    token: { name: 'Hatch Agent Test', symbol: 'HAGENT', uri: 'https://example.com/hatch/hagent.json' },
  },
}

// Shared by all presets. Flat 1% fee with dynamic fee on, collected in the quote token, and a
// graduation to DAMM v2 with a 1% pool fee. Default split (MEME, STOCK): 50/50 trading fees between
// partner (Hatch) and creator; post-graduation LP 45% claimable + 5% permanently locked each
// (protocol requires >= 10% locked). AI AGENT overrides the split in favor of the creator.
function base(
  quoteDecimals: number,
  split: { creatorTradingFeePercentage: number; partnerLp: number; creatorLp: number } = {
    creatorTradingFeePercentage: 50,
    partnerLp: 45,
    creatorLp: 45,
  }
): BuildCurveBaseParams {
  return {
    token: {
      tokenType: TokenType.SPLToken,
      tokenBaseDecimal: TokenDecimal.SIX,
      tokenQuoteDecimal: quoteDecimals,
      tokenAuthorityOption: TokenAuthorityOption.Immutable,
      totalTokenSupply: 1_000_000_000,
      leftover: 0,
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
        feeSchedulerParam: { startingFeeBps: 100, endingFeeBps: 100, numberOfPeriod: 0, totalDuration: 0 },
      },
      dynamicFeeEnabled: true,
      collectFeeMode: CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: split.creatorTradingFeePercentage,
      poolCreationFee: 0,
      enableFirstSwapWithMinFee: false,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2,
      migrationFeeOption: MigrationFeeOption.FixedBps100,
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
    },
    liquidityDistribution: {
      partnerLiquidityPercentage: split.partnerLp,
      partnerPermanentLockedLiquidityPercentage: 5,
      creatorLiquidityPercentage: split.creatorLp,
      creatorPermanentLockedLiquidityPercentage: 5,
    },
    lockedVesting: {
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    },
    activationType: ActivationType.Timestamp,
  }
}

export function curveFor(preset: PresetKey): ConfigParameters {
  if (preset === 'meme') {
    // Classic constant-product bonding curve: price rises smoothly as SOL comes in, and the
    // pool graduates once 1 SOL has been raised (devnet-sized), with 20% of supply seeding DAMM v2.
    return buildCurve({ ...base(9), percentageSupplyOnMigration: 20, migrationQuoteThreshold: 1 })
  }
  if (preset === 'agent') {
    // Gentler curve: 35% of supply seeds DAMM v2, so the price only climbs ~3.4x from first buy to
    // graduation (MEME climbs ~16x) and stays affordable longer while the same 1 SOL is raised.
    // Creator-favoring split: creator gets 80% of curve trading fees and 70% (+5% locked) of the graduated LP.
    return buildCurve({
      ...base(9, { creatorTradingFeePercentage: 80, partnerLp: 20, creatorLp: 70 }),
      percentageSupplyOnMigration: 35,
      migrationQuoteThreshold: 1,
    })
  }
  // Same smooth constant-product shape, priced in NVDAx: graduates after 50 NVDAx is raised,
  // and a larger 25% of supply goes to the DAMM v2 pool for deeper post-launch liquidity.
  return buildCurve({ ...base(NVDAX_DECIMALS), percentageSupplyOnMigration: 25, migrationQuoteThreshold: 50 })
}
