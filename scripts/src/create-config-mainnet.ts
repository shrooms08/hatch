// MAINNET: create the STOCK (real NVDAx quote) or MEME (SOL quote) DBC config, owned by mainnet-partner.
//   pnpm create-config-mainnet stock            # simulate (default)
//   pnpm create-config-mainnet meme --base spl  # simulate with an SPL base token
//   pnpm create-config-mainnet stock --mainnet --live   # send (asks for "YES MAINNET")
import { runIfMain, StepError, loadOrCreateKeypair } from './lib.js'
import { dbc, execLegacy, header, partner, readState, solscanAccount, writeState } from './mainnet/net.js'
import { KEEPER_MIN_USD, MEME_THRESHOLD_SOL, NVDAX_DECIMALS, THRESHOLD_MARGIN, NVDAX_MINT, WSOL_MINT, baseTokenTypeFromArgs, computeStockThreshold, memeCurve, nvdaxBadge, stockCurve } from './mainnet/presets.js'

const STEP = 'create-config-mainnet'

export async function createConfigMainnet(which: 'stock' | 'meme') {
  header(`${STEP} ${which}`)
  const owner = partner()
  const baseType = baseTokenTypeFromArgs()
  const existing = readState().configs?.[which]
  if (existing) throw new StepError(STEP, `A ${which} config already exists on mainnet: ${existing.config}. Not creating another.`)

  // Config keypair is kept (gitignored) so a simulated run and the live run use the same address.
  const { kp: config } = loadOrCreateKeypair(`mainnet-config-${which}`)
  let curve, quoteMint, quoteDecimals: number, thresholdRaw: string
  if (which === 'stock') {
    const t = await computeStockThreshold()
    console.log(`  NVDAx price: $${t.priceUi.toFixed(4)} per UI token, $${t.pricePrescaled.toFixed(4)} per raw/1e8 token (multiplier ${t.multiplier})`)
    console.log(`  threshold target: $${KEEPER_MIN_USD} x ${THRESHOLD_MARGIN} = $${t.targetUsd.toFixed(2)}`)
    console.log(`  threshold: raw ${t.raw} = ${t.prescaled} x 10^8 base units -> UI ${t.ui.toFixed(6)} NVDAx -> $${t.usd.toFixed(2)}`)
    curve = stockCurve(t.prescaled, baseType)
    quoteMint = NVDAX_MINT
    quoteDecimals = NVDAX_DECIMALS
    thresholdRaw = t.raw.toString()
  } else {
    curve = memeCurve(baseType)
    quoteMint = WSOL_MINT
    quoteDecimals = 9
    thresholdRaw = String(MEME_THRESHOLD_SOL * 1e9)
  }
  if (curve.migrationQuoteThreshold.toString() !== thresholdRaw) {
    throw new StepError(STEP, `Curve threshold ${curve.migrationQuoteThreshold} != expected raw ${thresholdRaw}`)
  }
  const tokenBadge = which === 'stock' ? await nvdaxBadge() : undefined
  if (which === 'stock' && !tokenBadge) throw new StepError(STEP, 'NVDAx DBC token badge not found on mainnet; config creation would fail.')
  console.log(`  config ${config.publicKey.toBase58()}  owner/feeClaimer ${owner.publicKey.toBase58()}  base token ${baseType}`)
  console.log(`  migrationQuoteThreshold raw ${thresholdRaw} (${which === 'meme' ? `${MEME_THRESHOLD_SOL} SOL` : 'NVDAx'}), migrates to DAMM v2${tokenBadge ? `, token badge ${tokenBadge.toBase58()}` : ''}`)

  const tx = await dbc.partner.createConfig({
    config: config.publicKey,
    feeClaimer: owner.publicKey,
    leftoverReceiver: owner.publicKey,
    quoteMint,
    payer: owner.publicKey,
    ...curve,
    ...(tokenBadge ? { tokenBadge } : {}),
  })
  const r = await execLegacy(STEP, `create ${which} config`, tx, owner, [config])
  if (!r.sig) return
  writeState((s) => {
    s.partner = owner.publicKey.toBase58()
    s.configs = { ...s.configs, [which]: { config: config.publicKey.toBase58(), quoteMint: quoteMint.toBase58(), quoteDecimals, thresholdRaw, baseTokenType: baseType, tx: r.sig! } }
  })
  const onchain = await dbc.state.getPoolConfig(config.publicKey)
  console.log(`  on-chain: quote ${onchain?.quoteMint.toBase58()}, threshold raw ${onchain?.migrationQuoteThreshold.toString()}, tokenType ${onchain?.tokenType}  ${solscanAccount(config.publicKey)}`)
}

runIfMain(import.meta.url, async () => {
  const which = process.argv[2]
  if (which !== 'stock' && which !== 'meme') throw new StepError(STEP, 'Usage: pnpm create-config-mainnet <stock|meme> [--base spl|token2022] [--mainnet --live]')
  await createConfigMainnet(which)
})
