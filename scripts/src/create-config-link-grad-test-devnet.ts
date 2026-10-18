// DEVNET TEST ONLY: a LINK config identical to the current devnet LINK config (link-preset.ts LINK-v1, first swap
// min fee ON, same partner) except migrationQuoteThreshold = 0.5 SOL, so a test pool can graduate cheaply.
// Never used by the app's hatch flow, never on mainnet (this script refuses any non-devnet RPC).
//   pnpm tsx src/create-config-link-grad-test-devnet.ts --live
import { RPC_URL, WSOL_MINT, accountExists, dbc, execute, hostOf, loadKeypair, loadOrCreateKeypair, runIfMain } from './lib.js'
import { assertLinkV1Spec, linkCurveV1 } from './link-preset.js'
import { DEVNET_LINK_CONFIG_KEY } from './create-config-link-devnet.js'

export const DEVNET_LINK_GRAD_TEST_CONFIG_KEY = 'devnet-config-link-v1b-grad-test'
const THRESHOLD_SOL = 0.5

runIfMain(import.meta.url, async () => {
  if (!/devnet/.test(hostOf(RPC_URL))) throw new Error(`devnet only (rpc is ${hostOf(RPC_URL)})`)
  const partner = loadKeypair('partner')
  const { kp: config } = loadOrCreateKeypair(DEVNET_LINK_GRAD_TEST_CONFIG_KEY)
  const curve = linkCurveV1(THRESHOLD_SOL)
  assertLinkV1Spec(curve, THRESHOLD_SOL)
  if (await accountExists(config.publicKey)) console.log(`  already exists: ${config.publicKey.toBase58()}`)
  else {
    const tx = await dbc.partner.createConfig({ config: config.publicKey, feeClaimer: partner.publicKey, leftoverReceiver: partner.publicKey, quoteMint: WSOL_MINT, payer: partner.publicKey, ...curve })
    await execute('create-config-link-grad-test', `create DEVNET TEST LINK config (threshold ${THRESHOLD_SOL} SOL)`, tx, partner, [config])
  }
  // Field-by-field against the current devnet LINK config: only the threshold (and what derives from it) may differ.
  const cur = (await dbc.state.getPoolConfig(loadKeypair(DEVNET_LINK_CONFIG_KEY).publicKey))! as unknown as Record<string, unknown>
  const test = (await dbc.state.getPoolConfig(config.publicKey))! as unknown as Record<string, unknown>
  const show = (v: unknown) => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && 'toBase58' in x ? (x as { toBase58(): string }).toBase58() : x && typeof x === 'object' && 'toString' in x && (x as object).constructor?.name === 'BN' ? (x as { toString(): string }).toString() : x))
  const diffs = Object.keys(cur).filter((k) => show(cur[k]) !== show(test[k]))
  console.log(`  differs from the current LINK config in: ${diffs.join(', ') || '(nothing)'}`)
  console.log(`  threshold: current ${String(cur.migrationQuoteThreshold)} | test ${String(test.migrationQuoteThreshold)} lamports`)
  console.log(`  LINK_GRAD_TEST_CONFIG=${config.publicKey.toBase58()}`)
})
