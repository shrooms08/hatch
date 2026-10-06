// MAINNET status (read-only): partner wallet, NVDAx facts, configs, test pool, fees, spend so far.
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { deriveTokenBadgeAddress } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { fmtUnits, runIfMain } from './lib.js'
import { connection, dbc, header, partner, readState, sol, solscanAccount } from './mainnet/net.js'
import { NVDAX_DECIMALS, NVDAX_MINT, livePrices, nvdaxMultiplier } from './mainnet/presets.js'

export async function statusMainnet() {
  header('status-mainnet (read-only)')
  const st = readState()
  const me = partner().publicKey
  const [prices, mult, lamports] = await Promise.all([livePrices(), nvdaxMultiplier(), connection.getBalance(me)])
  const nvdaxAta = getAssociatedTokenAddressSync(NVDAX_MINT, me, false, TOKEN_2022_PROGRAM_ID)
  const nvdaxRaw = await connection.getTokenAccountBalance(nvdaxAta).then((b) => b.value.amount).catch(() => '0')
  const badge = deriveTokenBadgeAddress(NVDAX_MINT)
  console.log(`  partner ${me.toBase58()}: ${sol(lamports)} SOL ($${((lamports / 1e9) * prices.sol).toFixed(2)}), NVDAx raw ${nvdaxRaw} (UI ${(Number(fmtUnits(nvdaxRaw, NVDAX_DECIMALS)) * mult).toFixed(8)})`)
  console.log(`  NVDAx ${NVDAX_MINT.toBase58()}  multiplier ${mult}  $${prices.nvdaxUi.toFixed(2)}/UI  badge ${badge.toBase58()} ${(await connection.getAccountInfo(badge)) ? 'exists' : 'MISSING'}`)
  for (const k of ['stock', 'meme'] as const) {
    const c = st.configs?.[k]
    console.log(`  ${k} config: ${c ? `${c.config} (threshold raw ${c.thresholdRaw}, ${c.baseTokenType} base)  ${solscanAccount(c.config)}` : 'not created'}`)
    const p = st.pools?.[k]
    if (!p) continue
    const pool = await dbc.state.getPool(p.pool)
    const cfg = pool && (await dbc.state.getPoolConfig(pool.poolState.config))
    if (!pool || !cfg) continue
    const prog = Number(pool.poolState.quoteReserve.toString()) / Number(cfg.migrationQuoteThreshold.toString())
    console.log(`    pool ${p.pool} (${p.symbol}): ${(prog * 100).toFixed(2)}% to migration, migrated=${pool.poolState.isMigrated === 1}, fees partner ${pool.poolState.partnerQuoteFee} / creator ${pool.poolState.creatorQuoteFee} raw quote`)
  }
  const spent = (st.txs ?? []).reduce((s, t) => s + (t.costLamports ?? 0), 0)
  console.log(`  sent ${st.txs?.length ?? 0} mainnet txs, total cost ${sol(spent)} SOL ($${((spent / 1e9) * prices.sol).toFixed(2)})`)
}

runIfMain(import.meta.url, statusMainnet)
