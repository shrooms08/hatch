// DEVNET: create the current LINK-v1 config (link-preset.ts; first swap with min fee ON), owned by the devnet
// partner key. Prints the config address for LINK_CONFIG. Devnet only.
//   pnpm tsx src/create-config-link-devnet.ts --live
import { RPC_URL, WSOL_MINT, accountExists, dbc, execute, hostOf, loadKeypair, loadOrCreateKeypair, runIfMain } from './lib.js'
import { assertLinkV1Spec, linkCurveV1 } from './link-preset.js'

export const DEVNET_LINK_CONFIG_KEY = 'devnet-config-link-v1b'

runIfMain(import.meta.url, async () => {
  if (!/devnet/.test(hostOf(RPC_URL))) throw new Error(`devnet only (rpc is ${hostOf(RPC_URL)})`)
  const partner = loadKeypair('partner')
  const { kp: config } = loadOrCreateKeypair(DEVNET_LINK_CONFIG_KEY)
  const curve = linkCurveV1()
  assertLinkV1Spec(curve)
  if (await accountExists(config.publicKey)) {
    console.log(`  already exists: ${config.publicKey.toBase58()}`)
  } else {
    const tx = await dbc.partner.createConfig({ config: config.publicKey, feeClaimer: partner.publicKey, leftoverReceiver: partner.publicKey, quoteMint: WSOL_MINT, payer: partner.publicKey, ...curve })
    await execute('create-config-link-devnet', 'create LINK-v1 (first swap min fee ON) devnet config', tx, partner, [config])
  }
  const c = await dbc.state.getPoolConfig(config.publicKey)
  if (c) console.log(`  on chain: enableFirstSwapWithMinFee ${(c as unknown as { enableFirstSwapWithMinFee: number }).enableFirstSwapWithMinFee}, creator fee ${c.creatorTradingFeePercentage}%, LP locked ${c.creatorPermanentLockedLiquidityPercentage}/${c.partnerPermanentLockedLiquidityPercentage}, threshold ${c.migrationQuoteThreshold.toString()}`)
  console.log(`  LINK_CONFIG=${config.publicKey.toBase58()}`)
})
