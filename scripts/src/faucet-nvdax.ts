// Dev-only devnet faucet: mints mock NVDAx (mint from state/devnet.json) to any address.
// Usage: pnpm faucet-nvdax <ADDRESS> [AMOUNT=1000]. Sends live on devnet (simulated first).
import { PublicKey, Transaction } from '@solana/web3.js'
import {
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token'
import { StepError, connection, execute, fmtUnits, header, loadKeypair, readState, runIfMain, toRaw } from './lib.js'

const STEP = 'faucet-nvdax'
const MAX_AMOUNT = 1_000_000

export async function faucetNvdax() {
  header(STEP)
  const [addr, amountArg = '1000'] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  if (!addr) throw new StepError(STEP, 'Usage: pnpm faucet-nvdax <ADDRESS> [AMOUNT]')
  let owner: PublicKey
  try {
    owner = new PublicKey(addr)
  } catch {
    throw new StepError(STEP, `Invalid address: ${addr}`)
  }
  const amount = Number(amountArg)
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    throw new StepError(STEP, `Amount must be between 0 and ${MAX_AMOUNT}, got ${amountArg}`)
  }
  const ms = readState().mockStock
  if (!ms) throw new StepError(STEP, 'No mock NVDAx mint in state/devnet.json. Run "pnpm mock-stock --live" first.')

  const mint = new PublicKey(ms.mint)
  const partner = loadKeypair('partner') // mock issuer = mint authority
  const ata = getAssociatedTokenAddressSync(mint, owner, true, TOKEN_2022_PROGRAM_ID)
  const tx = new Transaction().add(
    createAssociatedTokenAccountIdempotentInstruction(partner.publicKey, ata, owner, mint, TOKEN_2022_PROGRAM_ID),
    createMintToCheckedInstruction(mint, ata, partner.publicKey, BigInt(toRaw(amount, ms.decimals).toString()), ms.decimals, [], TOKEN_2022_PROGRAM_ID)
  )
  const sig = await execute(STEP, `mint ${amount} NVDAx to ${owner.toBase58()}`, tx, partner)
  if (!sig) return
  const bal = await getAccount(connection, ata, 'confirmed', TOKEN_2022_PROGRAM_ID)
  console.log(`  ${owner.toBase58()} now holds ${fmtUnits(bal.amount, ms.decimals)} NVDAx`)
}

runIfMain(import.meta.url, faucetNvdax)
