// Step 7: read-only summary of both pools.
import { DAMM_V2_MIGRATION_FEE_ADDRESS, deriveDammV2PoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { accountExists, dbc, fmtUnits, runIfMain, type PresetKey } from './lib.js'
import { BASE_DECIMALS } from './presets.js'
import { readPool } from './pool-view.js'

export async function status() {
  console.log('\n=== status (read-only, devnet) ===')
  for (const preset of ['meme', 'stock'] as PresetKey[]) {
    const v = await readPool(preset)
    console.log(`\n  [${preset}]`)
    if (!v) {
      console.log('  pool not on-chain yet.')
      continue
    }
    const p = v.preset
    const dammPool = deriveDammV2PoolAddress(
      DAMM_V2_MIGRATION_FEE_ADDRESS[v.config.migrationFeeOption],
      v.pool.poolState.baseMint,
      v.config.quoteMint
    )
    const fees = await dbc.state.getPoolFeeMetrics(v.address)
    const q = (x: { toString(): string }) => `${fmtUnits(x.toString(), p.quoteDecimals)} ${p.quoteSymbol}`
    const b = (x: { toString(): string }) => `${fmtUnits(x.toString(), BASE_DECIMALS)} ${p.token.symbol}`
    console.log(`  preset:          ${p.label}`)
    console.log(`  config:          ${v.pool.poolState.config.toBase58()}`)
    console.log(`  pool / base:     ${v.address.toBase58()} / ${v.pool.poolState.baseMint.toBase58()}`)
    console.log(`  quote mint:      ${v.config.quoteMint.toBase58()}`)
    console.log(`  curve progress:  ${(v.progress * 100).toFixed(2)}% (${v.migrationProgress})`)
    console.log(`  migrated:        ${v.isMigrated ? 'yes' : 'no'}`)
    console.log(`  DAMM v2 pool:    ${(await accountExists(dammPool)) ? dammPool.toBase58() : '-'}`)
    console.log(`  partner fees:    ${q(fees.current.partnerQuoteFee)} + ${b(fees.current.partnerBaseFee)} claimable`)
    console.log(`  creator fees:    ${q(fees.current.creatorQuoteFee)} + ${b(fees.current.creatorBaseFee)} claimable`)
  }
}

runIfMain(import.meta.url, status)
