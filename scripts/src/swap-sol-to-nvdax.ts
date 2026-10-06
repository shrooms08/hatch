// MAINNET: buy a tiny amount of NVDAx with SOL through Jupiter (explicit slippage).
//   pnpm swap-sol-to-nvdax --usd 0.5 [--slippage-bps 100] [--allow-multihop] [--mainnet --live]
// Direct route by default (no intermediate token account left open).
import { TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { StepError, runIfMain } from './lib.js'
import { connection, execVersioned, header, partner, sol } from './mainnet/net.js'
import { NVDAX_DECIMALS, NVDAX_MINT, WSOL_MINT, livePrices, nvdaxMultiplier } from './mainnet/presets.js'
import { jupQuote, jupSwapTx } from './mainnet/jupiter.js'

const STEP = 'swap-sol-to-nvdax'
const MAX_USD = 2 // hard cap for this test helper

function num(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`)
  const v = i >= 0 ? Number(process.argv[i + 1]) : fallback
  if (!Number.isFinite(v) || v <= 0) throw new StepError(STEP, `--${name} must be a positive number`)
  return v
}

export async function swapSolToNvdax() {
  header(STEP)
  const usd = num('usd', 0.5)
  const slippageBps = num('slippage-bps', 100)
  if (usd > MAX_USD) throw new StepError(STEP, `--usd ${usd} is above this helper's $${MAX_USD} cap`)
  if (slippageBps > 300) throw new StepError(STEP, 'slippage above 3% refused')
  const user = partner()
  const [prices, multiplier] = await Promise.all([livePrices(), nvdaxMultiplier()])
  const lamports = BigInt(Math.floor((usd / prices.sol) * 1e9))
  const q = await jupQuote(WSOL_MINT, NVDAX_MINT, lamports, slippageBps, { direct: !process.argv.includes('--allow-multihop') })
  const out = Number(q.outAmount) / 10 ** NVDAX_DECIMALS
  console.log(`  ${sol(lamports)} SOL ($${usd} at $${prices.sol.toFixed(2)}/SOL) -> ${q.outAmount} raw NVDAx (UI ${(out * multiplier).toFixed(8)}, ~$${(out * prices.nvdaxPrescaled).toFixed(3)})`)
  console.log(`  min out ${q.otherAmountThreshold} raw (slippage ${slippageBps} bps), price impact ${q.priceImpactPct}%, route ${q.routePlan.map((r) => r.swapInfo.label).join(' -> ')}`)
  const ata = getAssociatedTokenAddressSync(NVDAX_MINT, user.publicKey, false, TOKEN_2022_PROGRAM_ID)
  console.log(`  NVDAx account ${ata.toBase58()} ${(await connection.getAccountInfo(ata)) ? 'exists' : 'will be created (Token-2022, 179 bytes)'}`)
  const vtx = await jupSwapTx(q, user.publicKey)
  await execVersioned(STEP, `swap ${sol(lamports)} SOL -> NVDAx`, vtx, user)
}

runIfMain(import.meta.url, swapSolToNvdax)
