// Step 6: buy each pool up to its migration threshold, then migrate it to DAMM v2 ourselves
// (Meteora's keepers only run on mainnet). The partner wallet pays for migration.
import BN from 'bn.js'
import { CpAmm } from '@meteora-ag/cp-amm-sdk'
import { DAMM_V2_MIGRATION_FEE_ADDRESS, SwapMode, deriveDammV2PoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk'
import {
  accountExists,
  addrUrl,
  connection,
  currentPoint,
  dbc,
  execute,
  fmtUnits,
  header,
  loadKeypair,
  prerequisite,
  runIfMain,
  writeState,
  type PresetKey,
} from './lib.js'
import { BASE_DECIMALS } from './presets.js'
import { readPool } from './pool-view.js'
import { SLIPPAGE_BPS } from './buy.js'

const STEP = 'graduate'
const FEE_HEADROOM_BPS = 1500 // send 15% over the remaining quote; PartialFill refunds whatever the curve doesn't use

export async function graduate() {
  header(STEP)
  const creator = loadKeypair('creator')
  const partner = loadKeypair('partner')
  for (const preset of ['meme', 'stock'] as PresetKey[]) {
    console.log(`\n  [${preset}]`)
    let view = await readPool(preset)
    if (!prerequisite(view !== null, `${preset} pool`, STEP)) continue
    const p = view!.preset
    console.log(`  before: ${view!.describe()}`)

    // 1) Fill the curve.
    const s = view!.pool.poolState
    if (s.quoteReserve.lt(view!.config.migrationQuoteThreshold)) {
      const remaining = view!.config.migrationQuoteThreshold.sub(s.quoteReserve)
      const amountIn = remaining.mul(new BN(10_000 + FEE_HEADROOM_BPS)).div(new BN(10_000))
      const quote = dbc.pool.swapQuote2({
        virtualPool: view!.pool,
        config: view!.config,
        swapBaseForQuote: false,
        hasReferral: false,
        eligibleForFirstSwapWithMinFee: false,
        currentPoint: await currentPoint(view!.config.activationType),
        slippageBps: SLIPPAGE_BPS,
        swapMode: SwapMode.PartialFill,
        amountIn,
      })
      console.log(
        `  fill: remaining ${fmtUnits(remaining, p.quoteDecimals)} ${p.quoteSymbol}; sending up to ${fmtUnits(amountIn, p.quoteDecimals)} (PartialFill), ~${fmtUnits(quote.outputAmount, BASE_DECIMALS)} ${p.token.symbol} out, min ${fmtUnits(quote.minimumAmountOut!, BASE_DECIMALS)}`
      )
      const tx = await dbc.pool.swap2({
        owner: creator.publicKey,
        pool: view!.address,
        swapBaseForQuote: false,
        referralTokenAccount: null,
        swapMode: SwapMode.PartialFill,
        amountIn,
        minimumAmountOut: quote.minimumAmountOut!,
      })
      const sig = await execute(STEP, `fill ${p.token.symbol} curve`, tx, creator)
      if (!sig) {
        console.log('  - SKIPPED (dry run): migration needs the curve to be filled on-chain first.')
        continue
      }
      view = (await readPool(preset))!
      console.log(`  after fill: ${view.describe()}`)
    }

    // 2) Migrate to DAMM v2.
    const dammConfig = DAMM_V2_MIGRATION_FEE_ADDRESS[view!.config.migrationFeeOption]
    const dammPool = deriveDammV2PoolAddress(dammConfig, view!.pool.poolState.baseMint, view!.config.quoteMint)
    if (!view!.isMigrated) {
      const { transaction, firstPositionNftKeypair, secondPositionNftKeypair } = await dbc.migration.migrateToDammV2({
        payer: partner.publicKey,
        pool: view!.address,
        dammConfig,
      })
      const sig = await execute(STEP, `migrate ${p.token.symbol} to DAMM v2`, transaction, partner, [firstPositionNftKeypair, secondPositionNftKeypair], { computeUnits: 1_000_000 })
      if (!sig) continue
      writeState((st) => {
        st.migrations = { ...st.migrations, [preset]: { dammV2Pool: dammPool.toBase58(), dammConfig: dammConfig.toBase58(), tx: sig } }
      })
    } else {
      console.log('  already migrated.')
    }

    // 3) Re-read: DBC pool state and the DAMM v2 pool.
    view = (await readPool(preset))!
    console.log(`  DBC: isMigrated ${view.isMigrated}, ${view.describe()}`)
    if (await accountExists(dammPool)) {
      const d = await new CpAmm(connection).fetchPoolState(dammPool)
      console.log(`  DAMM v2 pool ${dammPool.toBase58()}: tokenA ${d.tokenAMint.toBase58()}, tokenB ${d.tokenBMint.toBase58()}, liquidity ${d.liquidity.toString()}`)
      console.log(`  ${addrUrl(dammPool)}`)
    } else {
      console.log(`  DAMM v2 pool ${dammPool.toBase58()} NOT found on-chain.`)
    }
    writeState((st) => {
      st.migrations = { ...st.migrations, [preset]: { ...st.migrations?.[preset], dammV2Pool: dammPool.toBase58(), dammConfig: dammConfig.toBase58() } }
    })
  }
}

runIfMain(import.meta.url, graduate)
