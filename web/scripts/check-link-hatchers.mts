// Devnet check: for every hatched/claimed link, the stored hatched_by must be the fee payer of the transaction
// that created its pool (the oldest signature on the pool account). Read-only. Prints addresses shortened.
//   node --env-file=.env.local --import tsx scripts/check-link-hatchers.mts
import { Connection } from '@solana/web3.js';
import { supabaseAdmin } from '../src/lib/server/supabase.ts';

const short = (s: string | null) => (s ? `${s.slice(0, 4)}…${s.slice(-4)}` : 'null');
const conn = new Connection(process.env.HATCH_SERVER_RPC_URL || process.env.RPC_URL || 'https://api.devnet.solana.com', 'confirmed');
const { data, error } = await supabaseAdmin().from('links').select('canonical_id, coin_ticker, mint, pool, status, hatched_by').eq('network', 'devnet').in('status', ['hatched', 'claimed']);
if (error) throw new Error(error.message);
let bad = 0;
for (const r of data ?? []) {
  let before: string | undefined;
  let oldest: string | null = null;
  for (;;) {
    const page = await conn.getSignaturesForAddress(new (await import('@solana/web3.js')).PublicKey(r.pool!), { before, limit: 1000 });
    if (!page.length) break;
    oldest = page[page.length - 1]!.signature;
    if (page.length < 1000) break;
    before = oldest;
  }
  const tx = oldest ? await conn.getTransaction(oldest, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }) : null;
  const payer = tx ? tx.transaction.message.getAccountKeys().staticAccountKeys[0]!.toBase58() : null;
  const ok = !!payer && payer === r.hatched_by;
  if (!ok) bad++;
  console.log(`${ok ? 'OK ' : 'BAD'} ${r.canonical_id} $${r.coin_ticker} status=${r.status} hatched_by=${short(r.hatched_by)} creation-fee-payer=${short(payer)}`);
}
console.log(`${data?.length ?? 0} rows, ${bad} mismatched`);
