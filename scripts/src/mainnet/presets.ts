// Mainnet presets: STOCK (quote = real NVDAx, Token-2022) and MEME (quote = SOL, also used by AI_AGENT).
import { PublicKey } from '@solana/web3.js'
import { TOKEN_2022_PROGRAM_ID, getMint, getScaledUiAmountConfig } from '@solana/spl-token'
import { BaseFeeMode, TokenType, buildCurve, deriveTokenBadgeAddress, type BuildCurveBaseParams, type ConfigParameters } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { base } from '../presets.js'
import { connection } from './net.js'

/**
 * NVIDIA xStock (NVDAx) on Solana. Verified 2026-10-06 against:
 *  - xStocks registry  https://api.xstocks.fi/api/v1/token  (symbol NVDAx, deployment "svm:Xsc9qv...qEh")
 *  - Jupiter token API https://lite-api.jup.ag/tokens/v2/search?query=NVDAx (isVerified, tags xstocks/verified)
 *  - on-chain: Token-2022, 8 decimals, metadata "NVIDIA xStock"/"NVDAx", uri xstocks-metadata.backed.fi
 * Beware: several unverified look-alike "NVDAx" mints exist.
 */
export const NVDAX_MINT = new PublicKey('Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh')
export const NVDAX_DECIMALS = 8
export const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112')

/** Mainnet keeper rule for Stock Token quotes: threshold >= $750 equivalent. We add 25% for price moves. */
export const KEEPER_MIN_USD = 750
export const THRESHOLD_MARGIN = 1.25
/** Keeper rule for SOL quotes: exactly 10 SOL. */
export const MEME_THRESHOLD_SOL = 10

export type BaseTokenType = 'spl' | 'token2022'
/**
 * Base token program for new Hatch tokens. Token-2022 keeps metadata in the mint itself, which
 * avoids the Metaplex metadata account and its 0.01 SOL protocol fee (measured: SPL-base launch
 * 0.0222 SOL vs Token-2022-base 0.0103 SOL with an NVDAx quote). Override with --base spl.
 */
export function baseTokenTypeFromArgs(): BaseTokenType {
  const i = process.argv.indexOf('--base')
  const v = i >= 0 ? process.argv[i + 1] : 'token2022'
  if (v !== 'spl' && v !== 'token2022') throw new Error(`--base must be spl or token2022, got ${v}`)
  return v
}

export async function nvdaxMultiplier(): Promise<number> {
  const m = await getMint(connection, NVDAX_MINT, 'confirmed', TOKEN_2022_PROGRAM_ID)
  const s = getScaledUiAmountConfig(m)
  if (!s) return 1
  return BigInt(Math.floor(Date.now() / 1000)) >= s.newMultiplierEffectiveTimestamp ? s.newMultiplier : s.multiplier
}

/** Live prices from Jupiter price v3. NVDAx: per UI token and per raw/1e8 ("prescaled") token. */
export async function livePrices(): Promise<{ sol: number; nvdaxUi: number; nvdaxPrescaled: number }> {
  const url = `https://lite-api.jup.ag/price/v3?ids=${WSOL_MINT.toBase58()},${NVDAX_MINT.toBase58()}`
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!r.ok) throw new Error(`Jupiter price API HTTP ${r.status}`)
  const j = (await r.json()) as Record<string, { usdPrice: number; scaledUiConfig?: { usdPricePrescaled: number } }>
  const s = j[WSOL_MINT.toBase58()]?.usdPrice
  const n = j[NVDAX_MINT.toBase58()]
  if (!s || !n?.usdPrice) throw new Error('Jupiter price API returned no SOL/NVDAx price')
  return { sol: s, nvdaxUi: n.usdPrice, nvdaxPrescaled: n.scaledUiConfig?.usdPricePrescaled ?? n.usdPrice }
}

export type StockThreshold = { raw: bigint; prescaled: number; ui: number; usd: number; targetUsd: number; multiplier: number; priceUi: number; pricePrescaled: number }

/**
 * migrationQuoteThreshold is compared against the pool's RAW quote reserve (no UI multiplier):
 *   raw       = ceil(targetUsd / pricePerPrescaledToken, to 0.01 token) * 10^8
 *   UI amount = raw / 10^8 * multiplier          (what wallets show)
 *   USD       = UI amount * pricePerUiToken     (== raw / 10^8 * pricePerPrescaledToken)
 */
export async function computeStockThreshold(): Promise<StockThreshold> {
  const [{ nvdaxUi, nvdaxPrescaled }, multiplier] = await Promise.all([livePrices(), nvdaxMultiplier()])
  const targetUsd = KEEPER_MIN_USD * THRESHOLD_MARGIN
  const prescaled = Math.ceil((targetUsd / nvdaxPrescaled) * 100) / 100
  const raw = BigInt(Math.round(prescaled * 10 ** NVDAX_DECIMALS))
  const ui = prescaled * multiplier
  return { raw, prescaled, ui, usd: ui * nvdaxUi, targetUsd, multiplier, priceUi: nvdaxUi, pricePrescaled: nvdaxPrescaled }
}

/** STOCK: smooth constant-product curve priced in NVDAx; 25% of supply seeds DAMM v2 on graduation. */
export function stockCurve(thresholdPrescaled: number, baseType: BaseTokenType): ConfigParameters {
  return buildCurve({
    ...base(NVDAX_DECIMALS),
    token: { ...base(NVDAX_DECIMALS).token, tokenType: baseType === 'token2022' ? TokenType.Token2022 : TokenType.SPLToken },
    percentageSupplyOnMigration: 25,
    migrationQuoteThreshold: thresholdPrescaled, // SDK converts to raw with tokenQuoteDecimal (no multiplier)
  })
}

/** MEME (and AI_AGENT on mainnet): classic curve, exactly 10 SOL to graduate (keeper rule). */
export function memeCurve(baseType: BaseTokenType): ConfigParameters {
  return buildCurve({
    ...base(9),
    token: { ...base(9).token, tokenType: baseType === 'token2022' ? TokenType.Token2022 : TokenType.SPLToken },
    percentageSupplyOnMigration: 20,
    migrationQuoteThreshold: MEME_THRESHOLD_SOL,
  })
}

export async function nvdaxBadge(): Promise<PublicKey | undefined> {
  const badge = deriveTokenBadgeAddress(NVDAX_MINT)
  return (await connection.getAccountInfo(badge, 'confirmed')) ? badge : undefined
}

// ---------- v2 presets: anti-sniper fee schedule, AI agent curve, more xStocks ----------

/**
 * Tesla xStock (TSLAx). Verified 2026-10-08: xStocks registry (api.xstocks.fi, "Tesla xStock",
 * deployment svm:XsDoVf…), Jupiter verified (tags xstocks/verified), on-chain Token-2022 with the same
 * extensions as NVDAx (no transfer fee, hook unset, not paused), multiplier 1, DBC badge exists.
 */
export const TSLAX_MINT = new PublicKey('XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB')
export const XSTOCKS = {
  NVDA: { mint: NVDAX_MINT, symbol: 'NVDAx', name: 'NVIDIA', decimals: 8 },
  TSLA: { mint: TSLAX_MINT, symbol: 'TSLAx', name: 'Tesla', decimals: 8 },
} as const
export type XStockTicker = keyof typeof XSTOCKS

/**
 * Anti-sniper base fee ("Sniper shield"): DBC fee scheduler, exponential, measured from the pool's
 * activation (launch) time. 50% at launch, decaying every 5 s over 12 steps to the normal 1% at 60 s.
 */
export const SNIPER_SHIELD = { startingFeeBps: 5000, endingFeeBps: 100, numberOfPeriod: 12, totalDuration: 60 } as const

function withSniperShield(p: BuildCurveBaseParams): BuildCurveBaseParams {
  return { ...p, fee: { ...p.fee, baseFeeParams: { baseFeeMode: BaseFeeMode.FeeSchedulerExponential, feeSchedulerParam: { ...SNIPER_SHIELD } } } }
}

/** Multiplier currently in force for any xStock mint (scaledUiAmount; 1 when absent). */
export async function xstockMultiplier(mint: PublicKey): Promise<number> {
  const m = await getMint(connection, mint, 'confirmed', TOKEN_2022_PROGRAM_ID)
  const s = getScaledUiAmountConfig(m)
  if (!s) return 1
  return BigInt(Math.floor(Date.now() / 1000)) >= s.newMultiplierEffectiveTimestamp ? s.newMultiplier : s.multiplier
}

/** Same rule as computeStockThreshold, for any xStock: >= $750 x 1.25 at live prices, raw units. */
export async function computeXStockThreshold(ticker: XStockTicker): Promise<StockThreshold> {
  const x = XSTOCKS[ticker]
  const url = `https://lite-api.jup.ag/price/v3?ids=${x.mint.toBase58()}`
  const r = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  if (!r.ok) throw new Error(`Jupiter price API HTTP ${r.status}`)
  const j = (await r.json()) as Record<string, { usdPrice: number; scaledUiConfig?: { usdPricePrescaled: number } }>
  const p = j[x.mint.toBase58()]
  if (!p?.usdPrice) throw new Error(`No Jupiter price for ${x.symbol}`)
  const multiplier = await xstockMultiplier(x.mint)
  const pricePrescaled = p.scaledUiConfig?.usdPricePrescaled ?? p.usdPrice * multiplier
  const targetUsd = KEEPER_MIN_USD * THRESHOLD_MARGIN
  const prescaled = Math.ceil((targetUsd / pricePrescaled) * 100) / 100
  const raw = BigInt(Math.round(prescaled * 10 ** x.decimals))
  const ui = prescaled * multiplier
  return { raw, prescaled, ui, usd: ui * p.usdPrice, targetUsd, multiplier, priceUi: p.usdPrice, pricePrescaled }
}

export async function xstockBadge(ticker: XStockTicker): Promise<PublicKey | undefined> {
  const badge = deriveTokenBadgeAddress(XSTOCKS[ticker].mint)
  return (await connection.getAccountInfo(badge, 'confirmed')) ? badge : undefined
}

/** STOCK v2: the v1 stock curve (25% of supply to DAMM v2, 50/50 split) plus the sniper shield. */
export function stockCurveV2(ticker: XStockTicker, thresholdPrescaled: number): ConfigParameters {
  const b = base(XSTOCKS[ticker].decimals)
  return buildCurve({ ...withSniperShield({ ...b, token: { ...b.token, tokenType: TokenType.Token2022 } }), percentageSupplyOnMigration: 25, migrationQuoteThreshold: thresholdPrescaled })
}

/** MEME v2: the v1 meme curve (20% to DAMM v2, 50/50, exactly 10 SOL) plus the sniper shield. */
export function memeCurveV2(): ConfigParameters {
  const b = base(9)
  return buildCurve({ ...withSniperShield({ ...b, token: { ...b.token, tokenType: TokenType.Token2022 } }), percentageSupplyOnMigration: 20, migrationQuoteThreshold: MEME_THRESHOLD_SOL })
}

/**
 * AI_AGENT: gentler and longer than MEME. 35% of supply seeds DAMM v2, so the price climbs far less
 * from first buy to graduation (stays affordable longer for the same 10 SOL raised). Creator-favoring:
 * creator gets 80% of curve trading fees and 70% (+5% locked) of the graduated LP. Sniper shield too.
 */
export function aiAgentCurve(): ConfigParameters {
  const b = base(9, { creatorTradingFeePercentage: 80, partnerLp: 20, creatorLp: 70 })
  return buildCurve({ ...withSniperShield({ ...b, token: { ...b.token, tokenType: TokenType.Token2022 } }), percentageSupplyOnMigration: 35, migrationQuoteThreshold: MEME_THRESHOLD_SOL })
}
