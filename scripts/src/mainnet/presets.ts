// Mainnet presets: STOCK (quote = real NVDAx, Token-2022) and MEME (quote = SOL, also used by AI_AGENT).
import { PublicKey } from '@solana/web3.js'
import { TOKEN_2022_PROGRAM_ID, getMint, getScaledUiAmountConfig } from '@solana/spl-token'
import { TokenType, buildCurve, deriveTokenBadgeAddress, type ConfigParameters } from '@meteora-ag/dynamic-bonding-curve-sdk'
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
