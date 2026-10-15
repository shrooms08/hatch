// MAINNET: create the LINK-v1 DBC config ("one official coin per link"), owned by mainnet-partner.
//   pnpm create-config-link-mainnet                     # simulate only (default)
//   pnpm create-config-link-mainnet --mainnet --live    # send (asks for YES MAINNET)
// LINK-v1 (link-preset.ts): SOL quote, 10 SOL threshold, Token-2022 base, the MEME-v2 curve shape, fees in the
// quote token, 50/50 creator/partner trading fees, no migration fee, sniper shield 50% -> 1% over 60 s, and
// liquidity at migration 100% permanently locked (creator 50%, partner 50%, nothing withdrawable).
// Pools under it are created by a one-time key and handed to the Squads vault in the same transaction
// (create-squads-vault-mainnet.ts); there is no standing "Nest" key.
import { isDeepStrictEqual } from 'node:util'
import { runIfMain, StepError, loadOrCreateKeypair } from './lib.js'
import { dbc, execLegacy, header, partner, readState, solscanAccount, writeState } from './mainnet/net.js'
import { WSOL_MINT, memeCurveV2 } from './mainnet/presets.js'
import { sniperShieldSteps } from './create-config-v2-mainnet.js'
import { LINK_SHIELD, LINK_THRESHOLD_SOL, assertLinkV1Spec, linkCurveV1 } from './link-preset.js'

const STEP = 'create-config-link-mainnet'
const plain = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && typeof x.toString === 'function' && x.constructor?.name === 'BN' ? x.toString() : x)))

export async function createLinkConfig() {
  header(STEP)
  const owner = partner()
  const existing = readState().configs?.linkV1
  if (existing) throw new StepError(STEP, `LINK-v1 already exists on mainnet: ${existing.config}. Not creating another.`)

  const curve = linkCurveV1()
  // The config must equal the LINK-v1 spec exactly (a config cannot be changed after creation).
  let spec: Record<string, unknown>
  try {
    spec = assertLinkV1Spec(curve)
  } catch (e) {
    throw new StepError(STEP, (e as Error).message)
  }
  // "Same curve as MEME-v2": identical start price and curve points.
  const meme = memeCurveV2()
  if (!isDeepStrictEqual(plain({ s: curve.sqrtStartPrice, c: curve.curve }), plain({ s: meme.sqrtStartPrice, c: meme.curve }))) throw new StepError(STEP, 'LINK-v1 curve points differ from MEME-v2; refusing to continue.')
  const thresholdRaw = String(LINK_THRESHOLD_SOL * 1e9)

  const { kp: config } = loadOrCreateKeypair('mainnet-config-link-v1')
  console.log(`  config ${config.publicKey.toBase58()}  (SOL quote, ${LINK_THRESHOLD_SOL} SOL threshold, Token-2022 base, DAMM v2 on graduation, MEME-v2 curve shape)`)
  console.log(`  spec check passed (${Object.keys(spec).length} fields): fees in the quote token (collectFeeMode ${curve.collectFeeMode}); creator ${curve.creatorTradingFeePercentage}% / partner ${100 - curve.creatorTradingFeePercentage}% of curve fees; migration fee ${curve.migrationFee.feePercentage}% (creator share ${curve.migrationFee.creatorFeePercentage}%)`)
  console.log(`  graduated LP: partner ${curve.partnerLiquidityPercentage}% withdrawable + ${curve.partnerPermanentLockedLiquidityPercentage}% permanently locked / creator ${curve.creatorLiquidityPercentage}% withdrawable + ${curve.creatorPermanentLockedLiquidityPercentage}% permanently locked`)
  console.log(`  sniper shield: ${sniperShieldSteps().map((f) => `${f.toFixed(1)}%`).join(' -> ')} (every ${LINK_SHIELD.totalDuration / LINK_SHIELD.numberOfPeriod}s), then ${LINK_SHIELD.endingFeeBps / 100}% + dynamic fee`)

  const tx = await dbc.partner.createConfig({ config: config.publicKey, feeClaimer: owner.publicKey, leftoverReceiver: owner.publicKey, quoteMint: WSOL_MINT, payer: owner.publicKey, ...curve })
  const r = await execLegacy(STEP, 'create LINK-v1 config', tx, owner, [config])
  if (!r.sig) return
  writeState((s) => {
    s.partner = owner.publicKey.toBase58()
    s.configs = { ...s.configs, linkV1: { config: config.publicKey.toBase58(), quoteMint: WSOL_MINT.toBase58(), quoteDecimals: 9, thresholdRaw, baseTokenType: 'token2022', tx: r.sig! } }
  })
  const onchain = await dbc.state.getPoolConfig(config.publicKey)
  const bf = onchain?.poolFees.baseFee
  console.log(`  on-chain: quote ${onchain?.quoteMint.toBase58()}, threshold raw ${onchain?.migrationQuoteThreshold.toString()}, base fee mode ${bf?.baseFeeMode} cliff ${bf?.cliffFeeNumerator.toString()} periods ${bf?.firstFactor}, LP locked creator ${onchain?.creatorPermanentLockedLiquidityPercentage}% / partner ${onchain?.partnerPermanentLockedLiquidityPercentage}%  ${solscanAccount(config.publicKey)}`)
}

runIfMain(import.meta.url, createLinkConfig)
