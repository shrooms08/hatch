// DEVNET end-to-end for link coins against a running web app (default http://localhost:3200, devnet mode):
// prepare -> hatch (the API returns ONE partially signed transaction) -> the hatcher signs and sends -> confirm ->
// check on chain that the pool's creator is the Hatch vault. Also: two concurrent hatch requests for one link
// (exactly one wins), and the same tweet through another URL form (refused).
//   pnpm tsx src/link-e2e-devnet.ts --live [--base http://localhost:3200]
import { PublicKey, Transaction } from '@solana/web3.js'
import { connection, dbc, hostOf, loadKeypair, RPC_URL, runIfMain, LIVE } from './lib.js'

const BASE = (() => {
  const i = process.argv.indexOf('--base')
  return i >= 0 ? process.argv[i + 1] : 'http://localhost:3200'
})()
const VAULT = new PublicKey('BV3ngWEbkUciHx1Q5s3G4jANnnHpkTZbUL2PgK7n61qo')

async function api<T>(path: string, body?: unknown): Promise<{ status: number; json: T & { error?: string } }> {
  const res = await fetch(`${BASE}${path}`, body === undefined ? undefined : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: res.status, json: (await res.json().catch(() => ({}))) as T & { error?: string } }
}

type Prep = { canonicalId: string; idHash: string; available?: true; exists?: { mint: string }; suggested?: { name: string; ticker: string; imageUrl: string | null }; metadata?: { title: string | null; owner: { platform: string; handle: string | null } } }
type Hatch = { transaction: string; mint: string; pool: string; canonicalId: string }

async function hatchOne(url: string, opts: { race?: boolean } = {}) {
  const hatcher = loadKeypair('creator')
  console.log(`\n--- ${url}`)
  const prep = await api<Prep>('/api/links/prepare', { url })
  if (prep.status !== 200) throw new Error(`prepare ${prep.status}: ${prep.json.error}`)
  const p = prep.json
  console.log(`  canonical id ${p.canonicalId} | owner ${p.metadata?.owner.handle ?? '-'} (${p.metadata?.owner.platform ?? '-'}) | title ${JSON.stringify(p.metadata?.title ?? null)?.slice(0, 80)}`)
  if (p.exists) return console.log(`  already hatched: mint ${p.exists.mint}`)
  const body = { url, wallet: hatcher.publicKey.toBase58(), name: p.suggested!.name, ticker: p.suggested!.ticker, imageUrl: p.suggested!.imageUrl ?? undefined, firstBuySol: '0.01' }
  console.log(`  suggested ${p.suggested!.name} ($${p.suggested!.ticker})`)

  let h: { status: number; json: Hatch & { error?: string } }
  if (opts.race) {
    const both = await Promise.all([api<Hatch>('/api/links/hatch', body), api<Hatch>('/api/links/hatch', body)])
    console.log(`  [race] two concurrent hatch requests -> HTTP ${both.map((b) => b.status).join(' and ')}${both.find((b) => b.status !== 200)?.json.error ? ` ("${both.find((b) => b.status !== 200)!.json.error}")` : ''}`)
    const winners = both.filter((b) => b.status === 200)
    if (winners.length !== 1) throw new Error(`expected exactly one winner, got ${winners.length}`)
    h = winners[0]
  } else {
    h = await api<Hatch>('/api/links/hatch', body)
  }
  if (h.status !== 200) throw new Error(`hatch ${h.status}: ${h.json.error}`)

  const tx = Transaction.from(Buffer.from(h.json.transaction, 'base64'))
  const signers = tx.signatures.filter((s) => s.signature).map((s) => s.publicKey.toBase58())
  console.log(`  server pre-signed by ${signers.length} keys (one-time creator + base mint), fee payer ${tx.feePayer?.toBase58()}`)
  tx.partialSign(hatcher)
  const sig = await connection.sendRawTransaction(tx.serialize())
  const bh = await connection.getLatestBlockhash('confirmed')
  await connection.confirmTransaction({ signature: sig, ...bh }, 'confirmed')
  console.log(`  ✓ hatch transaction ${sig}`)
  const c = await api<{ status: string }>('/api/links/confirm', { canonicalId: h.json.canonicalId, signature: sig })
  if (c.status !== 200) throw new Error(`confirm ${c.status}: ${c.json.error}`)
  const vp = await dbc.state.getPool(new PublicKey(h.json.pool))
  const creator = vp?.poolState.creator.toBase58()
  console.log(`  confirmed: status ${c.json.status} | mint ${h.json.mint} | pool ${h.json.pool} | creator on chain ${creator} ${creator === VAULT.toBase58() ? '= vault PDA ✓' : '!= vault ✗'}`)
  return { canonicalId: h.json.canonicalId, mint: h.json.mint, pool: h.json.pool, sig }
}

runIfMain(import.meta.url, async () => {
  if (!/devnet/.test(hostOf(RPC_URL))) throw new Error('devnet only')
  if (!LIVE) throw new Error('This sends devnet transactions; pass --live.')
  console.log(`=== link coins e2e [devnet] against ${BASE} ===`)
  await hatchOne('https://x.com/jack/status/20')
  await hatchOne('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  await hatchOne('https://github.com/MeteoraAg/dynamic-bonding-curve')
  await hatchOne('https://example.com/', { race: true })

  console.log('\n--- the same tweet through other URL forms')
  for (const url of ['https://twitter.com/jack/status/20?s=21&t=AbC', 'https://mobile.twitter.com/jack/status/20/photo/1']) {
    const prep = await api<Prep>('/api/links/prepare', { url })
    const h = await api<Hatch>('/api/links/hatch', { url, wallet: loadKeypair('creator').publicKey.toBase58(), name: 'Dup', ticker: 'DUP', firstBuySol: '0' })
    console.log(`  ${url} -> ${prep.json.canonicalId}: prepare says ${prep.json.exists ? `exists (mint ${prep.json.exists.mint})` : 'available'}; hatch -> HTTP ${h.status} "${h.json.error}"`)
  }
})
