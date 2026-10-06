// MAINNET cost estimate (read-only): every lamport of the plan vs the $5 budget.
//   pnpm cost-estimate-mainnet [--budget-usd 5] [--swap-usd 0.5]
import { runIfMain } from './lib.js'
import { PRIORITY_MICROLAMPORTS, connection, header, partner, sol } from './mainnet/net.js'
import { NVDAX_MINT, WSOL_MINT, computeStockThreshold, livePrices } from './mainnet/presets.js'
import { jupQuote } from './mainnet/jupiter.js'
import * as C from './mainnet/costs.js'

function num(name: string, fallback: number) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? Number(process.argv[i + 1]) : fallback
}

const prio = (cu: number) => Math.ceil(((cu * 1.15 + 1000) * PRIORITY_MICROLAMPORTS) / 1e6)

export async function costEstimate() {
  header('cost-estimate-mainnet (read-only)')
  const budgetUsd = num('budget-usd', 5)
  const swapUsd = num('swap-usd', 0.5)
  const prices = await livePrices()
  const rent = (n: number) => connection.getMinimumBalanceForRentExemption(n)
  const nvdaxAcct = C.NVDAX_TOKEN_ACCOUNT_BYTES
  const [rConfig, rNvdax, rWsol, rBaseSpl, rBase22] = await Promise.all([rent(C.CONFIG_BYTES), rent(nvdaxAcct), rent(165), rent(C.BASE_TOKEN_ACCOUNT_BYTES.spl), rent(C.BASE_TOKEN_ACCOUNT_BYTES.token2022)])
  if (rConfig !== 5_974_080) console.log(`  note: config rent is now ${rConfig}; the measured launch costs below assume the 2026-10-06 rent rate`)
  const swapLamports = BigInt(Math.floor((swapUsd / prices.sol) * 1e9))
  const q = await jupQuote(WSOL_MINT, NVDAX_MINT, swapLamports, 100, { direct: true })
  const t = await computeStockThreshold()

  const config = rConfig + C.SIGS.config * C.SIG_FEE + prio(C.APPROX_CU.config)
  const launch = (b: 'spl' | 'token2022') => C.STOCK_LAUNCH[b] + C.SIGS.launch * C.SIG_FEE + prio(C.APPROX_CU.launch)
  const swap = Number(swapLamports) + rNvdax + C.SIGS.swap * C.SIG_FEE + prio(C.APPROX_CU.swap)
  const buy = (b: 'spl' | 'token2022') => (b === 'spl' ? rBaseSpl : rBase22) + C.SIGS.buy * C.SIG_FEE + prio(C.APPROX_CU.buy)

  const budgetLamports = Math.floor((budgetUsd / prices.sol) * 1e9)
  const usd = (l: number) => (l / 1e9) * prices.sol
  console.log(`  SOL $${prices.sol.toFixed(2)} -> budget $${budgetUsd} = ${sol(budgetLamports)} SOL;  NVDAx $${prices.nvdaxUi.toFixed(2)}/UI`)
  console.log(`  rent: config(${C.CONFIG_BYTES}B) ${rConfig}, NVDAx acct(${nvdaxAcct}B, measured) ${rNvdax}, wSOL temp(165B) ${rWsol} (refunded in-tx), base ATA spl ${rBaseSpl} / token2022 ${rBase22}`)
  console.log(`  STOCK threshold: raw ${t.raw} = ${t.prescaled} NVDAx prescaled = UI ${t.ui.toFixed(6)} = $${t.usd.toFixed(2)} (target $${t.targetUsd})`)
  console.log(`  Jupiter: ${sol(swapLamports)} SOL -> ${q.outAmount} raw NVDAx via ${q.routePlan.map((r) => r.swapInfo.label).join(' -> ')}`)

  for (const b of ['token2022', 'spl'] as const) {
    const rows: [string, number][] = [
      ['1. STOCK config (NVDAx quote)', config],
      [`2a. Test launch on STOCK (${b} base)`, launch(b)],
      [`2b. Jupiter SOL->NVDAx ($${swapUsd} + NVDAx account rent)`, swap],
      ['2c. Tiny buy (new base-token account)', buy(b)],
      ['3. MEME config (SOL quote, 10 SOL threshold)', config],
    ]
    console.log(`\n  Plan with ${b} base tokens:`)
    console.log('  item                                              SOL        USD    running   fits')
    let run = 0
    for (const [label, l] of rows) {
      run += l
      console.log(`  ${label.padEnd(48)} ${sol(l)}  $${usd(l).toFixed(3).padStart(6)}  ${sol(run)}  ${run <= budgetLamports ? 'yes' : 'NO'}`)
    }
    console.log(`  peak extra during swap: wSOL temp account ${sol(rWsol)} (closed and returned in the same tx)`)
    console.log(`  optional refund: close the empty NVDAx account after spending it all (buy-mainnet --nvdax all --close-nvdax-ata): +${sol(rNvdax)}`)
  }
  console.log(`\n  partner wallet to fund: ${partner().publicKey.toBase58()}`)
}

runIfMain(import.meta.url, costEstimate)
