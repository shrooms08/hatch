// DEVNET proof: with LINK-v1 "first swap with min fee" ON, the hatcher's buy bundled in the pool-creation
// transaction pays the minimum fee, while a separate swap seconds later pays the sniper shield (~50%).
// Hatches a fresh link through the running web app (default http://localhost:3200, devnet mode), then sends a
// second buy from another wallet right away, and reads both fees from the DBC swap events on chain.
//   pnpm tsx src/link-firstbuy-proof-devnet.ts --live [--url <link>] [--base http://localhost:3200]
import BN from 'bn.js'
import { PublicKey, Transaction } from '@solana/web3.js'
import { DYNAMIC_BONDING_CURVE_PROGRAM_ID, SwapMode, createDbcProgram } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { LIVE, RPC_URL, connection, currentPoint, dbc, hostOf, loadKeypair, runIfMain } from './lib.js'

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : fallback
}
const BASE = arg('--base', 'http://localhost:3200')
const URL_TO_HATCH = arg('--url', 'https://en.wikipedia.org/wiki/Egg_as_food')
const sol = (l: bigint | number) => (Number(l) / 1e9).toFixed(9)

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
function b58decode(s: string): Buffer {
  let n = 0n
  for (const c of s) {
    const v = B58.indexOf(c)
    if (v < 0) throw new Error('bad base58')
    n = n * 58n + BigInt(v)
  }
  const hex = n === 0n ? '' : n.toString(16)
  const bytes = Buffer.from(hex.length % 2 ? `0${hex}` : hex, 'hex')
  const zeros = s.match(/^1*/)![0].length
  return Buffer.concat([Buffer.alloc(zeros), bytes])
}

async function post<T>(path: string, body: unknown): Promise<T & { error?: string }> {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const json = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new Error(`${path} ${res.status}: ${json.error}`)
  return json
}

const EVENT_IX_TAG = Buffer.from('e445a52e51cb9a1d', 'hex')
type Coder = { decode(b64: string): { name: string; data: Record<string, any> } | null }

/** The pool's swap(s) in a transaction, from evtSwap2: input incl. fee, total fee, timestamp. */
async function swapFees(sig: string, pool: string) {
  const coder = createDbcProgram(connection).program.coder.events as unknown as Coder
  const tx = await connection.getTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 1 } as never)
  if (!tx?.meta) throw new Error(`transaction ${sig} not found`)
  const keys = [...tx.transaction.message.staticAccountKeys.map((k) => k.toBase58()), ...(tx.meta.loadedAddresses?.writable ?? []).map(String), ...(tx.meta.loadedAddresses?.readonly ?? []).map(String)]
  const out: { input: bigint; fee: bigint; pct: number; ts: number }[] = []
  for (const g of tx.meta.innerInstructions ?? [])
    for (const ix of g.instructions) {
      if (keys[ix.programIdIndex] !== DYNAMIC_BONDING_CURVE_PROGRAM_ID.toBase58()) continue
      const raw = b58decode(ix.data)
      if (raw.length < 16 || !raw.subarray(0, 8).equals(EVENT_IX_TAG)) continue
      const ev = coder.decode(raw.subarray(8).toString('base64'))
      if (!ev || ev.name !== 'evtSwap2' || ev.data.pool.toBase58() !== pool) continue
      const r = ev.data.swapResult
      const input = BigInt(r.includedFeeInputAmount.toString())
      const fee = BigInt(r.tradingFee.toString()) + BigInt(r.protocolFee.toString()) + BigInt(r.referralFee.toString())
      out.push({ input, fee, pct: (Number(fee) / Number(input)) * 100, ts: Number(ev.data.currentTimestamp.toString()) })
    }
  return out
}

runIfMain(import.meta.url, async () => {
  if (!/devnet/.test(hostOf(RPC_URL))) throw new Error('devnet only')
  if (!LIVE) throw new Error('This sends devnet transactions; pass --live.')
  const hatcher = loadKeypair('creator')
  const second = loadKeypair('partner')
  console.log(`=== first-buy fee proof [devnet] ${URL_TO_HATCH} ===`)

  const prep = await post<{ canonicalId: string; available?: true; exists?: unknown; maxFirstBuySol: number; suggested?: { name: string; ticker: string; imageUrl: string | null } }>('/api/links/prepare', { url: URL_TO_HATCH, firstBuySol: '0.01' })
  if (!prep.available) throw new Error(`${prep.canonicalId} is not available (already hatched?). Pass another --url.`)
  console.log(`  ${prep.canonicalId} available | first-buy cap ${prep.maxFirstBuySol} SOL | ${prep.suggested!.name} ($${prep.suggested!.ticker})`)
  // Over the cap is refused before anything is built.
  const over = await fetch(`${BASE}/api/links/prepare`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: URL_TO_HATCH, firstBuySol: '1.5' }) })
  console.log(`  [cap] prepare with firstBuySol 1.5 -> HTTP ${over.status} "${((await over.json()) as { error?: string }).error}"`)

  const h = await post<{ transaction: string; mint: string; pool: string; canonicalId: string }>('/api/links/hatch', { url: URL_TO_HATCH, wallet: hatcher.publicKey.toBase58(), name: prep.suggested!.name, ticker: prep.suggested!.ticker, imageUrl: prep.suggested!.imageUrl ?? undefined, firstBuySol: '0.01' })
  const tx = Transaction.from(Buffer.from(h.transaction, 'base64'))
  tx.partialSign(hatcher)
  const sig1 = await connection.sendRawTransaction(tx.serialize())
  const bh = await connection.getLatestBlockhash('confirmed')
  await connection.confirmTransaction({ signature: sig1, ...bh }, 'confirmed')
  const landedAt = Date.now()
  console.log(`  ✓ hatch (pool creation + 0.01 SOL first buy): ${sig1}`)

  // A separate buy right away, from another wallet: the shield applies to it.
  const pool = new PublicKey(h.pool)
  const vp = (await dbc.state.getPool(pool))!
  const cfg = (await dbc.state.getPoolConfig(vp.poolState.config))!
  const amountIn = new BN(10_000_000)
  const quote = dbc.pool.swapQuote2({ virtualPool: vp, config: cfg, swapBaseForQuote: false, hasReferral: false, eligibleForFirstSwapWithMinFee: false, currentPoint: await currentPoint(cfg.activationType), slippageBps: 5000, swapMode: SwapMode.ExactIn, amountIn })
  const swapTx = await dbc.pool.swap2({ owner: second.publicKey, pool, swapBaseForQuote: false, referralTokenAccount: null, swapMode: SwapMode.ExactIn, amountIn, minimumAmountOut: quote.minimumAmountOut! })
  swapTx.feePayer = second.publicKey
  swapTx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash
  swapTx.sign(second)
  const sig2 = await connection.sendRawTransaction(swapTx.serialize())
  const bh2 = await connection.getLatestBlockhash('confirmed')
  await connection.confirmTransaction({ signature: sig2, ...bh2 }, 'confirmed')
  console.log(`  ✓ second buy (0.01 SOL, separate transaction, sent ${((Date.now() - landedAt) / 1000).toFixed(1)} s after the hatch confirmed): ${sig2}`)

  const c = await post<{ status: string }>('/api/links/confirm', { canonicalId: h.canonicalId, signature: sig1 })
  console.log(`  confirm -> ${c.status} | mint ${h.mint} | pool ${h.pool}`)

  const activation = Number(vp.poolState.activationPoint.toString())
  const [a] = await swapFees(sig1, h.pool)
  const [b] = await swapFees(sig2, h.pool)
  console.log(`  [fee] first buy (in the creation tx):  input ${sol(a.input)} SOL, fee ${sol(a.fee)} SOL = ${a.pct.toFixed(3)}% (at +${a.ts - activation}s)`)
  console.log(`  [fee] second buy (separate tx):        input ${sol(b.input)} SOL, fee ${sol(b.fee)} SOL = ${b.pct.toFixed(3)}% (at +${b.ts - activation}s)`)
})
