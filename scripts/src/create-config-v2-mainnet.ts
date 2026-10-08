// MAINNET: create one Hatch v2 DBC config (sniper shield on every preset), owned by mainnet-partner.
//   pnpm create-config-v2-mainnet <stock-nvda-v2|ai-agent|meme-v2|stock-tsla>              # simulate
//   pnpm create-config-v2-mainnet <name> --mainnet --live                                  # send (YES MAINNET)
import { getFeeSchedulerParams, BaseFeeMode } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { runIfMain, StepError, loadOrCreateKeypair } from './lib.js'
import { dbc, execLegacy, header, partner, readState, solscanAccount, writeState } from './mainnet/net.js'
import { KEEPER_MIN_USD, MEME_THRESHOLD_SOL, SNIPER_SHIELD, THRESHOLD_MARGIN, WSOL_MINT, XSTOCKS, aiAgentCurve, computeXStockThreshold, memeCurveV2, stockCurveV2, xstockBadge, type XStockTicker } from './mainnet/presets.js'

const STEP = 'create-config-v2-mainnet'
const PRESETS = {
  'stock-nvda-v2': { key: 'stockNvdaV2', stock: 'NVDA' },
  'ai-agent': { key: 'aiAgent' },
  'meme-v2': { key: 'memeV2' },
  'stock-tsla': { key: 'stockTsla', stock: 'TSLA' },
} as const
type Name = keyof typeof PRESETS

/** The decay the scheduler will apply: fee at the start of each 5 s period (exponential). */
export function sniperShieldSteps(): number[] {
  const p = getFeeSchedulerParams(SNIPER_SHIELD.startingFeeBps, SNIPER_SHIELD.endingFeeBps, BaseFeeMode.FeeSchedulerExponential, SNIPER_SHIELD.numberOfPeriod, SNIPER_SHIELD.totalDuration)
  const cliff = Number(p.cliffFeeNumerator.toString())
  const reduction = Number(p.thirdFactor.toString()) / 10_000
  return Array.from({ length: SNIPER_SHIELD.numberOfPeriod + 1 }, (_, i) => (cliff * (1 - reduction) ** i) / 1e7)
}

export async function createConfigV2(name: Name) {
  header(`${STEP} ${name}`)
  const preset = PRESETS[name]
  const owner = partner()
  const existing = readState().configs?.[preset.key]
  if (existing) throw new StepError(STEP, `${name} already exists on mainnet: ${existing.config}. Not creating another.`)
  const { kp: config } = loadOrCreateKeypair(`mainnet-config-${name}`)

  let curve, quoteMint, quoteDecimals: number, thresholdRaw: string, label: string
  const stock = 'stock' in preset ? (preset.stock as XStockTicker) : null
  if (stock) {
    const x = XSTOCKS[stock]
    const t = await computeXStockThreshold(stock)
    console.log(`  ${x.symbol} ${x.mint.toBase58()}: $${t.priceUi.toFixed(4)} per UI token, multiplier ${t.multiplier}`)
    console.log(`  threshold: $${KEEPER_MIN_USD} x ${THRESHOLD_MARGIN} = $${t.targetUsd.toFixed(2)} -> raw ${t.raw} = UI ${t.ui.toFixed(6)} ${x.symbol} ($${t.usd.toFixed(2)})`)
    curve = stockCurveV2(stock, t.prescaled)
    quoteMint = x.mint
    quoteDecimals = x.decimals
    thresholdRaw = t.raw.toString()
    label = `${x.symbol} quote`
  } else {
    curve = name === 'ai-agent' ? aiAgentCurve() : memeCurveV2()
    quoteMint = WSOL_MINT
    quoteDecimals = 9
    thresholdRaw = String(MEME_THRESHOLD_SOL * 1e9)
    label = `SOL quote, ${MEME_THRESHOLD_SOL} SOL threshold`
  }
  if (curve.migrationQuoteThreshold.toString() !== thresholdRaw) throw new StepError(STEP, `Curve threshold ${curve.migrationQuoteThreshold} != expected raw ${thresholdRaw}`)
  const tokenBadge = stock ? await xstockBadge(stock) : undefined
  if (stock && !tokenBadge) throw new StepError(STEP, `${XSTOCKS[stock].symbol} DBC token badge not found; config creation would fail.`)

  const steps = sniperShieldSteps()
  console.log(`  config ${config.publicKey.toBase58()}  (${label}, Token-2022 base, DAMM v2 on graduation${tokenBadge ? `, badge ${tokenBadge.toBase58()}` : ''})`)
  console.log(`  fee split: creator ${curve.creatorTradingFeePercentage}% / partner ${100 - curve.creatorTradingFeePercentage}% of curve fees; LP partner ${curve.partnerLiquidityPercentage}%+${curve.partnerPermanentLockedLiquidityPercentage}% / creator ${curve.creatorLiquidityPercentage}%+${curve.creatorPermanentLockedLiquidityPercentage}%`)
  console.log(`  sniper shield: ${steps.map((f) => `${f.toFixed(1)}%`).join(' -> ')} (every ${SNIPER_SHIELD.totalDuration / SNIPER_SHIELD.numberOfPeriod}s), then ${SNIPER_SHIELD.endingFeeBps / 100}% + dynamic fee`)

  const tx = await dbc.partner.createConfig({
    config: config.publicKey,
    feeClaimer: owner.publicKey,
    leftoverReceiver: owner.publicKey,
    quoteMint,
    payer: owner.publicKey,
    ...curve,
    ...(tokenBadge ? { tokenBadge } : {}),
  })
  const r = await execLegacy(STEP, `create ${name} config`, tx, owner, [config])
  if (!r.sig) return
  writeState((s) => {
    s.partner = owner.publicKey.toBase58()
    s.configs = { ...s.configs, [preset.key]: { config: config.publicKey.toBase58(), quoteMint: quoteMint.toBase58(), quoteDecimals, thresholdRaw, baseTokenType: 'token2022', tx: r.sig! } }
  })
  const onchain = await dbc.state.getPoolConfig(config.publicKey)
  const bf = onchain?.poolFees.baseFee
  console.log(`  on-chain: quote ${onchain?.quoteMint.toBase58()}, threshold raw ${onchain?.migrationQuoteThreshold.toString()}, base fee mode ${bf?.baseFeeMode} cliff ${bf?.cliffFeeNumerator.toString()} periods ${bf?.firstFactor}  ${solscanAccount(config.publicKey)}`)
}

runIfMain(import.meta.url, async () => {
  const name = process.argv[2] as Name
  if (!(name in PRESETS)) throw new StepError(STEP, `Usage: pnpm create-config-v2-mainnet <${Object.keys(PRESETS).join('|')}> [--mainnet --live]`)
  await createConfigV2(name)
})
