// MAINNET: claim the partner's trading fees from every pool under Hatch's mainnet configs into the
// partner wallet. Default is SIMULATION ONLY. Sending needs `--mainnet --live` AND typing "YES MAINNET".
//   pnpm claim-partner-fees-mainnet                  # simulate
//   pnpm claim-partner-fees-mainnet --mainnet --live # claim (asks for YES MAINNET once)
import BN from 'bn.js'
import { PublicKey } from '@solana/web3.js'
import { fmtUnits, runIfMain } from './lib.js'
import { connection, dbc, execLegacy, header, partner, readState } from './mainnet/net.js'

const STEP = 'claim-partner-fees-mainnet'

async function decimals(mint: PublicKey) {
  const info = await connection.getParsedAccountInfo(mint)
  return ((info.value?.data as { parsed?: { info?: { decimals?: number } } })?.parsed?.info?.decimals ?? 0) as number
}

type PoolEntry = { publicKey: PublicKey; account: NonNullable<Awaited<ReturnType<typeof dbc.state.getPool>>> }

/**
 * Pools under a config: getProgramAccounts (retried once; some RPCs intermittently return nothing)
 * plus the pools this repo launched (state/mainnet.json), de-duplicated.
 */
async function poolsUnder(config: string, st: ReturnType<typeof readState>): Promise<PoolEntry[]> {
  let found = (await dbc.state.getPoolsByConfig(config)) as unknown as PoolEntry[]
  if (!found.length) found = (await dbc.state.getPoolsByConfig(config)) as unknown as PoolEntry[]
  const byKey = new Map(found.map((p) => [p.publicKey.toBase58(), p]))
  for (const p of Object.values(st.pools ?? {})) {
    if (!p || byKey.has(p.pool)) continue
    const account = await dbc.state.getPool(p.pool)
    if (account && account.poolState.config.toBase58() === config) byKey.set(p.pool, { publicKey: new PublicKey(p.pool), account })
  }
  return [...byKey.values()]
}

export async function claimPartnerFeesMainnet() {
  header(STEP)
  const st = readState()
  const me = partner()
  const configs = Object.entries(st.configs ?? {}).filter(([, c]) => c?.config) as [string, { config: string }][]
  if (!configs.length) return console.log('  No mainnet configs in state/mainnet.json; nothing to claim.')

  let claimable = 0
  for (const [name, { config }] of configs) {
    const cfg = await dbc.state.getPoolConfig(config)
    if (!cfg) {
      console.log(`  ${name} config ${config}: not found on chain, skipped`)
      continue
    }
    if (!cfg.feeClaimer.equals(me.publicKey)) {
      console.log(`  ${name} config ${config}: fee claimer is ${cfg.feeClaimer.toBase58()}, not this partner wallet; skipped`)
      continue
    }
    const pools = await poolsUnder(config, st)
    console.log(`  ${name} config ${config}: ${pools.length} pool(s)`)
    const quoteDecimals = await decimals(cfg.quoteMint)
    for (const { publicKey, account } of pools) {
      const base = account.poolState.partnerBaseFee as BN
      const quote = account.poolState.partnerQuoteFee as BN
      const baseDecimals = await decimals(account.poolState.baseMint)
      const amounts = `base ${fmtUnits(base.toString(), baseDecimals)} / quote ${fmtUnits(quote.toString(), quoteDecimals)} (raw ${base} / ${quote})`
      if (base.isZero() && quote.isZero()) {
        console.log(`    ${publicKey.toBase58()}: nothing to claim`)
        continue
      }
      claimable++
      console.log(`    ${publicKey.toBase58()}: partner fees ${amounts}`)
      const tx = await dbc.partner.claimPartnerTradingFee({
        feeClaimer: me.publicKey,
        payer: me.publicKey,
        pool: publicKey,
        maxBaseAmount: base,
        maxQuoteAmount: quote,
      })
      await execLegacy(STEP, `claim partner fees from ${publicKey.toBase58().slice(0, 8)}…`, tx, me)
    }
  }
  console.log(`  ${claimable} pool(s) with fees to claim. ${process.argv.includes('--live') ? '' : 'Simulation only; nothing was sent.'}`)
}

runIfMain(import.meta.url, claimPartnerFeesMainnet)
