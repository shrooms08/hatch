// MAINNET helpers: connection, the mainnet-partner key, state file, and a guarded executor.
// Default is SIMULATION ONLY. Sending needs BOTH `--mainnet --live` on the command line AND the
// operator typing "YES MAINNET" at an interactive prompt (once per run). Never prints secrets.
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  VersionedTransaction,
  type Signer,
} from '@solana/web3.js'
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { StepError, hostOf, loadOrCreateKeypair } from '../lib.js'

export const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com'
if (/devnet|testnet|localhost|127\.0\.0\.1/i.test(MAINNET_RPC_URL)) {
  console.error(`MAINNET_RPC_URL points at ${hostOf(MAINNET_RPC_URL)}; mainnet scripts need a mainnet RPC.`)
  process.exit(1)
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const STATE_FILE = path.join(ROOT, 'state', 'mainnet.json')

/** Sending is armed only with both flags; the typed confirmation is still required. */
export const ARMED = process.argv.includes('--mainnet') && process.argv.includes('--live')
export const SIMULATE_ONLY = !ARMED

export const connection = new Connection(MAINNET_RPC_URL, 'confirmed')
export const dbc = new DynamicBondingCurveClient(connection, 'confirmed')

/** Priority fee kept minimal: micro-lamports per CU (x CU limit from simulation). */
export const PRIORITY_MICROLAMPORTS = Number(process.env.MAINNET_PRIORITY_MICROLAMPORTS ?? 1_000)

export const PARTNER_KEY = 'mainnet-partner'
export const partner = () => loadOrCreateKeypair(PARTNER_KEY).kp

export const solscanTx = (sig: string) => `https://solscan.io/tx/${sig}`
export const solscanAccount = (a: PublicKey | string) => `https://solscan.io/account/${a.toString()}`

export type MainnetState = {
  partner?: string
  configs?: Partial<Record<'stock' | 'meme', { config: string; quoteMint: string; quoteDecimals: number; thresholdRaw: string; baseTokenType: 'spl' | 'token2022'; tx?: string }>>
  pools?: Partial<Record<'stock' | 'meme', { pool: string; baseMint: string; name: string; symbol: string; uri: string; tx?: string }>>
  txs?: { step: string; label: string; sig: string; url: string; feeLamports?: number; costLamports?: number }[]
}

export function readState(): MainnetState {
  return fs.existsSync(STATE_FILE) ? JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) : {}
}

export function writeState(update: (s: MainnetState) => void) {
  const s = readState()
  update(s)
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true })
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + '\n')
}

export function header(step: string) {
  console.log(`\n=== ${step} [MAINNET ${ARMED ? 'ARMED: will ask before sending' : 'SIMULATION ONLY'}] rpc=${hostOf(MAINNET_RPC_URL)} ===`)
}

export const sol = (lamports: number | bigint) => (Number(lamports) / LAMPORTS_PER_SOL).toFixed(6)

let confirmed = false
/** The typed confirmation. Asked once per run, only when armed, only on an interactive terminal. */
async function confirmMainnet(summary: string) {
  if (confirmed) return
  if (!process.stdin.isTTY) throw new StepError('confirm', 'Refusing to send on mainnet without an interactive terminal for the "YES MAINNET" confirmation.')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await rl.question(`\n  About to SEND on MAINNET: ${summary}\n  Type YES MAINNET to continue: `)
  rl.close()
  if (answer.trim() !== 'YES MAINNET') throw new StepError('confirm', 'Not confirmed; nothing was sent.')
  confirmed = true
}

async function checkBalance(payer: PublicKey, needLamports: number, label: string) {
  const bal = await connection.getBalance(payer, 'confirmed')
  if (bal < needLamports) {
    throw new StepError(label, `Payer ${payer.toBase58()} has ${sol(bal)} SOL; this step needs about ${sol(needLamports)} SOL. Fund it first.`)
  }
}

export type ExecResult = { sig: string | null; simulatedCostLamports: number | null; unitsConsumed: number | null }

/**
 * Simulate a legacy transaction (payer cost via post-simulation balance), then, only if armed and
 * confirmed, send it with a CU limit sized from the simulation and the minimal priority fee.
 */
export async function execLegacy(step: string, label: string, tx: Transaction, payer: Keypair, extraSigners: Signer[] = [], opts: { expectCostLamports?: number } = {}): Promise<ExecResult> {
  const signers = [payer, ...extraSigners.filter((s) => !s.publicKey.equals(payer.publicKey))]
  tx.instructions = tx.instructions.filter((ix) => !ix.programId.equals(ComputeBudgetProgram.programId))
  tx.feePayer = payer.publicKey
  tx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash
  tx.sign(...signers)

  const exists = (await connection.getAccountInfo(payer.publicKey)) !== null
  if (!exists) {
    console.log(`  - "${label}": not simulated, payer ${payer.publicKey.toBase58()} is unfunded (no account on mainnet yet).`)
    return { sig: null, simulatedCostLamports: null, unitsConsumed: null }
  }
  const pre = await connection.getBalance(payer.publicKey, 'confirmed')
  const sim = await connection.simulateTransaction(tx, undefined, [payer.publicKey])
  if (sim.value.err) throw new StepError(step, `Simulation failed for "${label}": ${JSON.stringify(sim.value.err)}`, sim.value.logs ?? [])
  const post = (sim.value.accounts?.[0] as { lamports: number } | null)?.lamports ?? pre
  const units = sim.value.unitsConsumed ?? 200_000
  const cuLimit = Math.ceil(units * 1.15) + 1_000
  const priorityLamports = Math.ceil((cuLimit * PRIORITY_MICROLAMPORTS) / 1_000_000)
  const cost = pre - post + priorityLamports
  console.log(`  ✓ simulated "${label}": ${units} CU, payer cost ≈ ${sol(cost)} SOL (rent + fee + ${priorityLamports} lamports priority)`)
  if (SIMULATE_ONLY) return { sig: null, simulatedCostLamports: cost, unitsConsumed: units }

  await checkBalance(payer.publicKey, cost, step)
  await confirmMainnet(`${label} (≈ ${sol(cost)} SOL from ${payer.publicKey.toBase58()})`)
  tx.instructions.unshift(
    ComputeBudgetProgram.setComputeUnitLimit({ units: cuLimit }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_MICROLAMPORTS })
  )
  const bh = await connection.getLatestBlockhash('confirmed')
  tx.recentBlockhash = bh.blockhash
  tx.signatures = []
  tx.sign(...signers)
  return finish(step, label, await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 }), bh, payer.publicKey, pre, units)
}

/** Same guard for an already-built versioned transaction (Jupiter swaps). */
export async function execVersioned(step: string, label: string, vtx: VersionedTransaction, payer: Keypair): Promise<ExecResult> {
  const exists = (await connection.getAccountInfo(payer.publicKey)) !== null
  if (!exists) {
    console.log(`  - "${label}": not simulated, payer ${payer.publicKey.toBase58()} is unfunded (no account on mainnet yet).`)
    return { sig: null, simulatedCostLamports: null, unitsConsumed: null }
  }
  const pre = await connection.getBalance(payer.publicKey, 'confirmed')
  const sim = await connection.simulateTransaction(vtx, { sigVerify: false, replaceRecentBlockhash: true, accounts: { encoding: 'base64', addresses: [payer.publicKey.toBase58()] } })
  if (sim.value.err) throw new StepError(step, `Simulation failed for "${label}": ${JSON.stringify(sim.value.err)}`, sim.value.logs ?? [])
  const post = sim.value.accounts?.[0]?.lamports ?? pre
  console.log(`  ✓ simulated "${label}": ${sim.value.unitsConsumed} CU, payer cost ≈ ${sol(pre - post)} SOL`)
  if (SIMULATE_ONLY) return { sig: null, simulatedCostLamports: pre - post, unitsConsumed: sim.value.unitsConsumed ?? null }

  await checkBalance(payer.publicKey, pre - post, step)
  await confirmMainnet(`${label} (≈ ${sol(pre - post)} SOL from ${payer.publicKey.toBase58()})`)
  vtx.sign([payer])
  const bh = await connection.getLatestBlockhash('confirmed')
  return finish(step, label, await connection.sendRawTransaction(vtx.serialize(), { skipPreflight: false, maxRetries: 3 }), bh, payer.publicKey, pre, sim.value.unitsConsumed ?? null)
}

async function finish(step: string, label: string, sig: string, bh: { blockhash: string; lastValidBlockHeight: number }, payer: PublicKey, pre: number, units: number | null): Promise<ExecResult> {
  const res = await connection.confirmTransaction({ signature: sig, ...bh }, 'confirmed')
  if (res.value.err) throw new StepError(step, `Transaction ${sig} failed: ${JSON.stringify(res.value.err)}`)
  const post = await connection.getBalance(payer, 'confirmed')
  const tx = await connection.getTransaction(sig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' })
  console.log(`  ✓ sent "${label}": ${solscanTx(sig)} (cost ${sol(pre - post)} SOL)`)
  writeState((s) => {
    s.txs = [...(s.txs ?? []), { step, label, sig, url: solscanTx(sig), feeLamports: tx?.meta?.fee, costLamports: pre - post }]
  })
  return { sig, simulatedCostLamports: pre - post, unitsConsumed: units }
}
