// Step 4: as the creator, launch one DBC pool on each preset config.
import { deriveDbcPoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk'
import {
  accountExists,
  addrUrl,
  dbc,
  execute,
  header,
  loadKeypair,
  loadOrCreateKeypair,
  prerequisite,
  runIfMain,
  writeState,
  type PresetKey,
} from './lib.js'
import { PRESETS } from './presets.js'
import { badgeIfAny } from './create-configs.js'

const STEP = 'launch'

export async function launch() {
  header(STEP)
  const creator = loadKeypair('creator')
  for (const preset of ['meme', 'stock'] as PresetKey[]) {
    const p = PRESETS[preset]
    const config = loadOrCreateKeypair(`config-${preset}`).kp.publicKey
    const { kp: baseMint } = loadOrCreateKeypair(`base-${preset}`)
    const quoteMint = p.quoteMint()
    const pool = deriveDbcPoolAddress(quoteMint, baseMint.publicKey, config)
    console.log(`\n  [${p.label}] ${p.token.name} (${p.token.symbol}) base mint ${baseMint.publicKey.toBase58()}  pool ${pool.toBase58()}`)

    if (await accountExists(pool)) {
      console.log('  pool already exists on devnet; not relaunching.')
    } else {
      if (!prerequisite(await accountExists(config), `${preset} config`, STEP)) continue
      const tokenBadge = await badgeIfAny(quoteMint)
      const tx = await dbc.creator.createPool({
        name: p.token.name,
        symbol: p.token.symbol,
        uri: p.token.uri,
        payer: creator.publicKey,
        poolCreator: creator.publicKey,
        config,
        baseMint: baseMint.publicKey,
        ...(tokenBadge ? { tokenBadge } : {}),
      })
      const sig = await execute(STEP, `launch ${p.token.symbol}`, tx, creator, [baseMint])
      if (!sig) continue
      writeState((s) => {
        s.pools = { ...s.pools, [preset]: { pool: pool.toBase58(), baseMint: baseMint.publicKey.toBase58(), name: p.token.name, symbol: p.token.symbol, tx: sig } }
      })
    }

    // Re-read on-chain state.
    const v = await dbc.state.getPool(pool)
    if (!v) throw new Error(`pool ${pool.toBase58()} not readable`)
    console.log(`  on-chain: config ${v.poolState.config.toBase58()}, creator ${v.poolState.creator.toBase58()}, baseReserve ${v.poolState.baseReserve.toString()}, quoteReserve ${v.poolState.quoteReserve.toString()}`)
    console.log(`  ${addrUrl(pool)}`)
    writeState((s) => {
      s.pools = { ...s.pools, [preset]: { ...s.pools?.[preset], pool: pool.toBase58(), baseMint: baseMint.publicKey.toBase58(), name: p.token.name, symbol: p.token.symbol } }
    })
  }
}

runIfMain(import.meta.url, launch)
