// Read-only helpers to describe a DBC pool: price, curve progress, migration state.
import { PublicKey } from '@solana/web3.js'
import { deriveDbcPoolAddress, getPriceFromSqrtPrice } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { dbc, fmtUnits, hasKeypair, loadKeypair, type PresetKey } from './lib.js'
import { BASE_DECIMALS, PRESETS } from './presets.js'

const MIGRATION_PROGRESS = ['PreBondingCurve', 'PostBondingCurve', 'LockedVesting', 'CreatedPool']

export function poolAddressFor(preset: PresetKey): PublicKey | null {
  if (!hasKeypair(`config-${preset}`) || !hasKeypair(`base-${preset}`)) return null
  return deriveDbcPoolAddress(
    PRESETS[preset].quoteMint(),
    loadKeypair(`base-${preset}`).publicKey,
    loadKeypair(`config-${preset}`).publicKey
  )
}

export async function readPool(preset: PresetKey) {
  const address = poolAddressFor(preset)
  if (!address) return null
  const pool = await dbc.state.getPool(address)
  if (!pool) return null
  const config = await dbc.state.getPoolConfig(pool.poolState.config)
  if (!config) throw new Error(`config ${pool.poolState.config.toBase58()} for pool ${address.toBase58()} not readable`)
  const p = PRESETS[preset]
  const s = pool.poolState
  const price = getPriceFromSqrtPrice(s.sqrtPrice, BASE_DECIMALS, p.quoteDecimals)
  const progress = Math.min(1, Number(s.quoteReserve.toString()) / Number(config.migrationQuoteThreshold.toString()))
  return {
    address,
    pool,
    config,
    preset: p,
    price,
    progress,
    isMigrated: s.isMigrated === 1,
    migrationProgress: MIGRATION_PROGRESS[s.migrationProgress] ?? String(s.migrationProgress),
    describe() {
      return `price ${price.toSignificantDigits(6).toString()} ${p.quoteSymbol}/${p.token.symbol}, quote reserve ${fmtUnits(s.quoteReserve, p.quoteDecimals)} / ${fmtUnits(config.migrationQuoteThreshold, p.quoteDecimals)} ${p.quoteSymbol} (${(progress * 100).toFixed(2)}% to migration), stage ${MIGRATION_PROGRESS[s.migrationProgress]}`
    },
  }
}
