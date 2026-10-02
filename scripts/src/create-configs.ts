// Step 3: create the MEME (wSOL quote) and STOCK (mock NVDAx quote) DBC configs, owned by the
// partner wallet (fee claimer + leftover receiver), migrating to DAMM v2.
import { PublicKey } from '@solana/web3.js'
import { deriveTokenBadgeAddress } from '@meteora-ag/dynamic-bonding-curve-sdk'
import {
  accountExists,
  addrUrl,
  dbc,
  execute,
  fmtUnits,
  header,
  loadKeypair,
  loadOrCreateKeypair,
  prerequisite,
  runIfMain,
  writeState,
  type PresetKey,
} from './lib.js'
import { PRESETS, curveFor } from './presets.js'

const STEP = 'create-configs'

export async function createConfigs() {
  header(STEP)
  const partner = loadKeypair('partner')
  for (const preset of ['meme', 'stock'] as PresetKey[]) await createConfig(preset, partner)
}

export async function createConfig(preset: PresetKey, partner: ReturnType<typeof loadKeypair>) {
  const p = PRESETS[preset]
  const quoteMint = p.quoteMint()
  const { kp: config } = loadOrCreateKeypair(`config-${preset}`)
  console.log(`\n  [${p.label}] config ${config.publicKey.toBase58()}  quote ${quoteMint.toBase58()}`)

  const curve = curveFor(preset)
  console.log(`  curve: migrationQuoteThreshold ${fmtUnits(curve.migrationQuoteThreshold, p.quoteDecimals)} ${p.quoteSymbol}, creator fee share ${curve.creatorTradingFeePercentage}%`)

  if (await accountExists(config.publicKey)) {
    console.log('  config already exists on devnet; not recreating.')
  } else {
    if (!prerequisite(await accountExists(quoteMint), `quote mint ${p.quoteSymbol}`, STEP)) return
    const tokenBadge = await badgeIfAny(quoteMint)
    const tx = await dbc.partner.createConfig({
      config: config.publicKey,
      feeClaimer: partner.publicKey,
      leftoverReceiver: partner.publicKey,
      quoteMint,
      payer: partner.publicKey,
      ...curve,
      ...(tokenBadge ? { tokenBadge } : {}),
    })
    const sig = await execute(STEP, `create ${preset} config`, tx, partner, [config])
    if (!sig) return
    writeState((s) => {
      s.configs = { ...s.configs, [preset]: { config: config.publicKey.toBase58(), quoteMint: quoteMint.toBase58(), quoteDecimals: p.quoteDecimals, tx: sig } }
    })
  }

  // Re-read on-chain state.
  const onchain = await dbc.state.getPoolConfig(config.publicKey)
  if (!onchain) throw new Error(`config ${config.publicKey.toBase58()} not readable`)
  console.log(
    `  on-chain: quote ${onchain.quoteMint.toBase58()} (quoteTokenFlag ${onchain.quoteTokenFlag}), threshold ${fmtUnits(onchain.migrationQuoteThreshold, p.quoteDecimals)} ${p.quoteSymbol}, migrationOption ${onchain.migrationOption} (1 = DAMM v2), feeClaimer ${onchain.feeClaimer.toBase58()}`
  )
  console.log(`  ${addrUrl(config.publicKey)}`)
  writeState((s) => {
    s.configs = { ...s.configs, [preset]: { ...s.configs?.[preset], config: config.publicKey.toBase58(), quoteMint: quoteMint.toBase58(), quoteDecimals: p.quoteDecimals } }
  })
}

/** Returns the DBC token badge PDA for `mint` if one exists on-chain (needed only for non-permissionless quote mints). */
export async function badgeIfAny(mint: PublicKey): Promise<PublicKey | undefined> {
  const badge = deriveTokenBadgeAddress(mint)
  const exists = await accountExists(badge)
  console.log(`  token badge ${badge.toBase58()}: ${exists ? 'exists, passing it' : 'none (not needed for metadata-only/SPL quote mints)'}`)
  return exists ? badge : undefined
}

runIfMain(import.meta.url, createConfigs)
