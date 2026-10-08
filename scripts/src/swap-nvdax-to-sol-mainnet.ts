// MAINNET: swap ALL of the partner's NVDAx to SOL through Jupiter (explicit slippage) and close the
// emptied NVDAx token account in the same transaction (its rent comes back). Simulates by default;
// sending needs --mainnet --live and the typed "YES MAINNET".
//   pnpm swap-nvdax-to-sol-mainnet [--slippage-bps 100] [--mainnet --live]
import { ComputeBudgetProgram, TransactionMessage, VersionedTransaction, type AddressLookupTableAccount } from '@solana/web3.js'
import { TOKEN_2022_PROGRAM_ID, createCloseAccountInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token'
import { StepError, runIfMain } from './lib.js'
import { PRIORITY_MICROLAMPORTS, connection, execVersioned, header, partner, sol } from './mainnet/net.js'
import { NVDAX_DECIMALS, NVDAX_MINT, WSOL_MINT, livePrices, nvdaxMultiplier } from './mainnet/presets.js'
import { jupQuote, jupSwapInstructions } from './mainnet/jupiter.js'

const STEP = 'swap-nvdax-to-sol-mainnet'

export async function swapNvdaxToSol() {
  header(STEP)
  const i = process.argv.indexOf('--slippage-bps')
  const slippageBps = i >= 0 ? Number(process.argv[i + 1]) : 100
  if (!(slippageBps > 0 && slippageBps <= 300)) throw new StepError(STEP, 'slippage must be 1-300 bps')
  const user = partner()
  const ata = getAssociatedTokenAddressSync(NVDAX_MINT, user.publicKey, false, TOKEN_2022_PROGRAM_ID)
  const bal = await connection.getTokenAccountBalance(ata).catch(() => null)
  const raw = BigInt(bal?.value.amount ?? '0')
  if (raw === BigInt(0)) throw new StepError(STEP, 'No NVDAx to swap')
  const [prices, multiplier] = await Promise.all([livePrices(), nvdaxMultiplier()])
  const ui = (Number(raw) / 10 ** NVDAX_DECIMALS) * multiplier
  // Direct route first (no intermediate account left open); fall back to any route.
  const q = await jupQuote(NVDAX_MINT, WSOL_MINT, raw, slippageBps).catch(() => jupQuote(NVDAX_MINT, WSOL_MINT, raw, slippageBps, { direct: false }))
  console.log(`  ${raw} raw NVDAx (UI ${ui.toFixed(8)}, ~$${(ui * prices.nvdaxUi).toFixed(2)}) -> ${sol(BigInt(q.outAmount))} SOL expected, min ${sol(BigInt(q.otherAmountThreshold))} SOL`)
  console.log(`  slippage ${slippageBps} bps, price impact ${q.priceImpactPct}%, route ${q.routePlan.map((r) => r.swapInfo.label).join(' -> ')}`)
  const jup = await jupSwapInstructions(q, user.publicKey)
  // The swap spends the whole balance, so the NVDAx account is empty and can be closed in the same tx.
  const close = createCloseAccountInstruction(ata, user.publicKey, user.publicKey, [], TOKEN_2022_PROGRAM_ID)
  const tables = (await Promise.all(jup.lookupTables.map((t) => connection.getAddressLookupTable(t)))).map((r) => r.value).filter((v): v is AddressLookupTableAccount => !!v)
  const { blockhash } = await connection.getLatestBlockhash('confirmed')
  const msg = new TransactionMessage({
    payerKey: user.publicKey,
    recentBlockhash: blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: jup.computeUnitLimit + 20_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_MICROLAMPORTS }),
      ...jup.setup.filter((ix) => !ix.programId.equals(ComputeBudgetProgram.programId)),
      ...jup.other,
      jup.swap,
      ...jup.cleanup,
      close,
    ],
  }).compileToV0Message(tables)
  const vtx = new VersionedTransaction(msg)
  console.log(`  one v0 transaction: ${vtx.serialize().length} bytes, swap + close NVDAx account ${ata.toBase58()}`)
  await execVersioned(STEP, `swap ${ui.toFixed(6)} NVDAx -> SOL + close NVDAx account`, vtx, user)
}

runIfMain(import.meta.url, swapNvdaxToSol)
