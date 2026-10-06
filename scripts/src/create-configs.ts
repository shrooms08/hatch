// Step 3: create the MEME (wSOL quote) and STOCK (mock NVDAx quote) DBC configs, owned by the
// partner wallet (fee claimer + leftover receiver), migrating to DAMM v2.
import { PublicKey } from '@solana/web3.js'
import { TokenType, deriveTokenBadgeAddress } from '@meteora-ag/dynamic-bonding-curve-sdk'
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
  const t22 = process.argv.includes('--base') && process.argv[process.argv.indexOf('--base') + 1] === 'token2022'
  const only = process.argv.find((a) => a === 'meme' || a === 'stock') as PresetKey | undefined
  for (const preset of (only ? [only] : ['meme', 'stock']) as PresetKey[]) await createConfig(preset, partner, t22 ? 'token2022' : 'spl')
}

/** `base`: the launched tokens' program. Token-2022 configs are separate (keys config-<preset>-t22, state t22Configs). */
export async function createConfig(preset: PresetKey, partner: ReturnType<typeof loadKeypair>, base: 'spl' | 'token2022' = 'spl') {
  const p = PRESETS[preset]
  const quoteMint = p.quoteMint()
  const t22 = base === 'token2022'
  const { kp: config } = loadOrCreateKeypair(t22 ? `config-${preset}-t22` : `config-${preset}`)
  console.log(`\n  [${p.label}] config ${config.publicKey.toBase58()}  quote ${quoteMint.toBase58()}`)

  const baseCurve = curveFor(preset)
  const curve = t22 ? { ...baseCurve, tokenType: TokenType.Token2022 } : baseCurve
  console.log(`  base token: ${t22 ? 'Token-2022' : 'SPL'}`)
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
      const entry = { config: config.publicKey.toBase58(), quoteMint: quoteMint.toBase58(), quoteDecimals: p.quoteDecimals, tx: sig }
      if (t22) s.t22Configs = { ...s.t22Configs, [preset]: entry }
      else s.configs = { ...s.configs, [preset]: entry }
    })
  }

  // Re-read on-chain state.
  const onchain = await dbc.state.getPoolConfig(config.publicKey)
  if (!onchain) throw new Error(`config ${config.publicKey.toBase58()} not readable`)
  console.log(
    `  on-chain: quote ${onchain.quoteMint.toBase58()} (quoteTokenFlag ${onchain.quoteTokenFlag}), threshold ${fmtUnits(onchain.migrationQuoteThreshold, p.quoteDecimals)} ${p.quoteSymbol}, migrationOption ${onchain.migrationOption} (1 = DAMM v2), feeClaimer ${onchain.feeClaimer.toBase58()}`
  )
  console.log(`  ${addrUrl(config.publicKey)}`)
  console.log(`  on-chain tokenType ${onchain.tokenType} (0 = SPL, 1 = Token-2022)`)
  writeState((s) => {
    const entry = { config: config.publicKey.toBase58(), quoteMint: quoteMint.toBase58(), quoteDecimals: p.quoteDecimals }
    if (t22) s.t22Configs = { ...s.t22Configs, [preset]: { ...s.t22Configs?.[preset], ...entry } }
    else s.configs = { ...s.configs, [preset]: { ...s.configs?.[preset], ...entry } }
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
