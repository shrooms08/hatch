// Step 5: small creator buys on each pool with explicit slippage protection
// (quote -> minimumAmountOut at 1% slippage, enforced on-chain).
import { SwapMode } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { currentPoint, dbc, execute, fmtUnits, header, loadKeypair, prerequisite, runIfMain, toRaw, type PresetKey } from './lib.js'
import { BASE_DECIMALS } from './presets.js'
import { readPool } from './pool-view.js'

const STEP = 'buy'
export const SLIPPAGE_BPS = 100
const AMOUNTS: Record<'meme' | 'stock', number> = { meme: 0.05, stock: 2 }

export async function buy() {
  header(STEP)
  const creator = loadKeypair('creator')
  for (const preset of ['meme', 'stock'] as const) {
    const before = await readPool(preset)
    console.log(`\n  [${preset}]`)
    if (!prerequisite(before !== null, `${preset} pool`, STEP)) continue
    const { preset: p } = before!
    console.log(`  before: ${before!.describe()}`)

    const amountIn = toRaw(AMOUNTS[preset], p.quoteDecimals)
    const quote = dbc.pool.swapQuote2({
      virtualPool: before!.pool,
      config: before!.config,
      swapBaseForQuote: false,
      hasReferral: false,
      eligibleForFirstSwapWithMinFee: false,
      currentPoint: await currentPoint(before!.config.activationType),
      slippageBps: SLIPPAGE_BPS,
      swapMode: SwapMode.ExactIn,
      amountIn,
    })
    console.log(
      `  quote: ${AMOUNTS[preset]} ${p.quoteSymbol} -> ~${fmtUnits(quote.outputAmount, BASE_DECIMALS)} ${p.token.symbol}, min out ${fmtUnits(quote.minimumAmountOut!, BASE_DECIMALS)} (slippage ${SLIPPAGE_BPS} bps)`
    )
    const tx = await dbc.pool.swap2({
      owner: creator.publicKey,
      pool: before!.address,
      swapBaseForQuote: false,
      referralTokenAccount: null,
      swapMode: SwapMode.ExactIn,
      amountIn,
      minimumAmountOut: quote.minimumAmountOut!,
    })
    const sig = await execute(STEP, `buy ${AMOUNTS[preset]} ${p.quoteSymbol} of ${p.token.symbol}`, tx, creator)
    if (!sig) continue
    console.log(`  after:  ${(await readPool(preset))!.describe()}`)
  }
}

runIfMain(import.meta.url, buy)
