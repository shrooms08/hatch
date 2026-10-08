// Shared helpers for the Hatch devnet DBC loop: connection, keypairs, state file,
// and a simulate-then-send executor. DEVNET ONLY.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  type Signer,
} from '@solana/web3.js'
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk'
import BN from 'bn.js'

export const RPC_URL = process.env.RPC_URL ?? 'https://api.devnet.solana.com'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const KEYS_DIR = path.join(ROOT, 'keys')
const STATE_FILE = path.join(ROOT, 'state', 'devnet.json')

/** Only the host of an RPC URL is ever printed: the URL can carry an API key. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return '(invalid URL)'
  }
}

// Hard guard: this project must never talk to mainnet.
if (/mainnet/i.test(RPC_URL)) {
  console.error(`Refusing to run against ${hostOf(RPC_URL)}: these scripts are devnet-only.`)
  process.exit(1)
}

// Default is DRY RUN (simulate only). Real devnet transactions require --live (or HATCH_LIVE=1,
// used only by the dev faucet).
export const LIVE =
  (process.argv.includes('--live') || process.env.HATCH_LIVE === '1') && !process.argv.includes('--dry-run')
export const DRY_RUN = !LIVE

export const connection = new Connection(RPC_URL, 'confirmed')
export const dbc = new DynamicBondingCurveClient(connection, 'confirmed')

export const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112')

export type PresetKey = 'meme' | 'stock' | 'agent'

export type State = {
  mockStock?: { mint: string; decimals: number; tx?: string }
  configs?: Partial<Record<PresetKey, { config: string; quoteMint: string; quoteDecimals: number; tx?: string }>>
  /** Same presets with a Token-2022 base token (create-configs --base token2022). */
  t22Configs?: Partial<Record<PresetKey, { config: string; quoteMint: string; quoteDecimals: number; tx?: string }>>
  pools?: Partial<Record<PresetKey, { pool: string; baseMint: string; name: string; symbol: string; tx?: string }>>
  migrations?: Partial<Record<PresetKey, { dammV2Pool: string; dammConfig: string; tx?: string }>>
  txs?: { step: string; label: string; sig: string; url: string }[]
}

export class StepError extends Error {
  constructor(
    public step: string,
    message: string,
    public logs: string[] = []
  ) {
    super(message)
  }
}

// ---------- keypairs ----------

export function keyPath(name: string) {
  return path.join(KEYS_DIR, `${name}.json`)
}

export function hasKeypair(name: string) {
  return fs.existsSync(keyPath(name))
}

export function loadKeypair(name: string): Keypair {
  const p = keyPath(name)
  if (!fs.existsSync(p)) throw new Error(`Missing keypair ${p}. Run "pnpm setup-wallets" first.`)
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(p, 'utf8'))))
}

/** Loads a keypair, creating it (mode 600) if missing. Secrets are never printed. */
export function loadOrCreateKeypair(name: string): { kp: Keypair; created: boolean } {
  if (hasKeypair(name)) return { kp: loadKeypair(name), created: false }
  fs.mkdirSync(KEYS_DIR, { recursive: true })
  const kp = Keypair.generate()
  fs.writeFileSync(keyPath(name), JSON.stringify(Array.from(kp.secretKey)), { mode: 0o600 })
  return { kp, created: true }
}

// ---------- state ----------

export function readState(): State {
  if (!fs.existsSync(STATE_FILE)) return {}
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
}

export function writeState(update: (s: State) => void) {
  const s = readState()
  update(s)
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true })
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2) + '\n')
}

// ---------- formatting ----------

export const txUrl = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`
export const addrUrl = (a: PublicKey | string) => `https://explorer.solana.com/address/${a.toString()}?cluster=devnet`

export function fmtUnits(raw: BN | bigint | number | string, decimals: number, dp = 6): string {
  const s = raw.toString()
  const neg = s.startsWith('-')
  const digits = (neg ? s.slice(1) : s).padStart(decimals + 1, '0')
  const whole = digits.slice(0, digits.length - decimals)
  const frac = digits.slice(digits.length - decimals).slice(0, dp).replace(/0+$/, '')
  return `${neg ? '-' : ''}${whole}${frac ? '.' + frac : ''}`
}

export function toRaw(amount: number, decimals: number): BN {
  const [w, f = ''] = amount.toString().split('.')
  return new BN(w + f.padEnd(decimals, '0').slice(0, decimals))
}

export async function solBalance(pk: PublicKey) {
  return (await connection.getBalance(pk, 'confirmed')) / LAMPORTS_PER_SOL
}

export function header(step: string) {
  console.log(`\n=== ${step} ${DRY_RUN ? '[DRY RUN: simulate only]' : '[LIVE: devnet]'} ===`)
}

// ---------- execution ----------

function ensureComputeUnitLimit(tx: Transaction, units: number) {
  const has = tx.instructions.some(
    (ix) => ix.programId.equals(ComputeBudgetProgram.programId) && ix.data[0] === 2
  )
  if (!has) tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units }))
}

/**
 * Simulates `tx`; on failure throws StepError with program logs. In live mode it then
 * sends, confirms, prints an Explorer link and records the signature in state.
 * Returns the signature (live) or null (dry run).
 */
export async function execute(
  step: string,
  label: string,
  tx: Transaction,
  feePayer: Keypair,
  extraSigners: Signer[] = [],
  opts: { computeUnits?: number } = {}
): Promise<string | null> {
  if (opts.computeUnits) ensureComputeUnitLimit(tx, opts.computeUnits)
  const signers = dedupe([feePayer, ...extraSigners])
  tx.feePayer = feePayer.publicKey
  tx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash

  const sim = await connection.simulateTransaction(tx, signers)
  if (sim.value.err) {
    throw new StepError(step, `Simulation failed for "${label}": ${JSON.stringify(sim.value.err)}`, sim.value.logs ?? [])
  }
  console.log(`  ✓ simulated "${label}" (${sim.value.unitsConsumed ?? '?'} CU)`)
  if (DRY_RUN) return null

  try {
    const sig = await sendAndConfirmTransaction(connection, tx, signers, { commitment: 'confirmed' })
    console.log(`  ✓ sent "${label}": ${txUrl(sig)}`)
    writeState((s) => {
      s.txs = [...(s.txs ?? []), { step, label, sig, url: txUrl(sig) }]
    })
    return sig
  } catch (e: any) {
    throw new StepError(step, `Send failed for "${label}": ${e?.message ?? e}`, e?.logs ?? e?.transactionLogs ?? [])
  }
}

function dedupe(signers: Signer[]) {
  const seen = new Set<string>()
  return signers.filter((s) => {
    const k = s.publicKey.toBase58()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

/** Current activation point for quotes: block time for timestamp configs, slot otherwise. */
export async function currentPoint(activationType: number): Promise<BN> {
  const slot = await connection.getSlot('confirmed')
  if (activationType === 0) return new BN(slot)
  const t = await connection.getBlockTime(slot)
  return new BN(t ?? Math.floor(Date.now() / 1000))
}

/**
 * Gate for on-chain prerequisites. Live: missing prerequisite is a hard failure.
 * Dry run: earlier steps were only simulated, so later steps that depend on their
 * accounts cannot be simulated yet; report that and skip.
 */
export function prerequisite(ok: boolean, what: string, step: string): boolean {
  if (ok) return true
  if (LIVE) throw new StepError(step, `${what} is not on-chain yet. Run the earlier step(s) first.`)
  console.log(`  - SKIPPED (dry run): ${what} is not on-chain yet; this will be simulated right before sending in the live run.`)
  return false
}

export async function accountExists(pk: PublicKey) {
  return (await connection.getAccountInfo(pk, 'confirmed')) !== null
}

/** Runs `main` when the file is executed directly; prints StepErrors clearly and exits 1. */
export function runIfMain(metaUrl: string, main: () => Promise<unknown>) {
  if (process.argv[1] && metaUrl === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch((e) => {
      reportError(e)
      process.exit(1)
    })
  }
}

export function reportError(e: unknown) {
  if (e instanceof StepError) {
    console.error(`\n✗ FAILED at step: ${e.step}\n  error: ${e.message}`)
    if (e.logs.length) console.error('  program logs:\n    ' + e.logs.join('\n    '))
  } else {
    console.error('\n✗ FAILED:', e)
  }
}
