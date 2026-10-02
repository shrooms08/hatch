// Step 1: create the "partner" (Hatch platform) and "creator" (test user) devnet wallets,
// request devnet airdrops, and print balances. Airdrops are faucet requests, not
// transactions we sign, and are needed so later steps can be simulated at all.
import { LAMPORTS_PER_SOL, type PublicKey } from '@solana/web3.js'
import { addrUrl, connection, header, loadOrCreateKeypair, runIfMain, solBalance, StepError, txUrl } from './lib.js'

const STEP = 'setup-wallets'
const TARGET_SOL = 2
const MIN_SOL = 1.5 // skip the airdrop if the wallet already has at least this much
const ATTEMPTS = 3

export async function setupWallets() {
  header(STEP)
  const wallets = (['partner', 'creator'] as const).map((name) => {
    const { kp, created } = loadOrCreateKeypair(name)
    console.log(`  ${name}: ${kp.publicKey.toBase58()} ${created ? '(new)' : '(existing)'}`)
    return { name, pk: kp.publicKey }
  })

  const rateLimited: { name: string; pk: PublicKey }[] = []
  for (const w of wallets) {
    if ((await solBalance(w.pk)) >= MIN_SOL) continue
    if (!(await airdrop(w.name, w.pk))) rateLimited.push(w)
  }

  console.log('\n  Balances:')
  for (const w of wallets) console.log(`    ${w.name}: ${(await solBalance(w.pk)).toFixed(4)} SOL  ${addrUrl(w.pk)}`)

  if (rateLimited.length) {
    console.log('\n  Airdrop unavailable. Fund these addresses from a web faucet (e.g. https://faucet.solana.com, devnet), 2 SOL each:')
    for (const w of rateLimited) console.log(`    ${w.name}: ${w.pk.toBase58()}`)
    throw new StepError(STEP, 'Devnet airdrop rate-limited or failed; stopping until the wallets are funded.')
  }
}

async function airdrop(name: string, pk: PublicKey): Promise<boolean> {
  for (let i = 1; i <= ATTEMPTS; i++) {
    try {
      const sig = await connection.requestAirdrop(pk, TARGET_SOL * LAMPORTS_PER_SOL)
      const bh = await connection.getLatestBlockhash('confirmed')
      await connection.confirmTransaction({ signature: sig, ...bh }, 'confirmed')
      console.log(`  ✓ airdropped ${TARGET_SOL} SOL to ${name}: ${txUrl(sig)}`)
      return true
    } catch (e: any) {
      const msg = String(e?.message ?? e).split('\n')[0]
      console.log(`  ! airdrop to ${name} attempt ${i}/${ATTEMPTS} failed: ${msg}`)
      if (/429|rate|limit|faucet has run dry/i.test(msg)) return false
      if (i < ATTEMPTS) await new Promise((r) => setTimeout(r, 5000 * i))
    }
  }
  return false
}

runIfMain(import.meta.url, setupWallets)
