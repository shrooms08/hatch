// DEVNET end-to-end for link coin claims (P4a), with a script approver:
//   hatch a GitHub repo's coin (through the running devnet web app), accrue creator fees with a few trades,
//   submit a claim (the GitHub sign-in is SIMULATED here: a browser OAuth step cannot run in a script; the owner rule
//   itself is unit-tested), check the proposal's contents, show the server key cannot vote, approve with the devnet
//   approver key, let the server execute, and verify on chain. Then the same for a disown to a second wallet.
// Devnet only; keys from scripts/keys (gitignored), never printed. Sends devnet transactions: needs --live.
//   node --env-file=.env.local --import tsx scripts/link-claim-e2e-devnet.mts --live [--base http://localhost:3200]
import { readFileSync } from 'node:fs';
import BN from 'bn.js';
import * as multisig from '@sqds/multisig';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { DYNAMIC_BONDING_CURVE_PROGRAM_ID, DynamicBondingCurveClient, SwapMode } from '@meteora-ag/dynamic-bonding-curve-sdk';

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1]! : fallback;
};
const BASE = arg('--base', 'http://localhost:3200');
const CLAIM_URL = arg('--claim-url', 'https://github.com/octocat/Hello-World');
const DISOWN_URL = arg('--disown-url', 'https://github.com/octocat/Spoon-Knife');
const sol = (l: bigint | number | BN | string) => (Number(l.toString()) / 1e9).toFixed(9);
const short = (k: PublicKey | string) => `${k.toString().slice(0, 4)}…${k.toString().slice(-4)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const key = (name: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(new URL(`../../scripts/keys/${name}.json`, import.meta.url), 'utf8')) as number[]));

if (process.env.NEXT_PUBLIC_SOLANA_NETWORK !== 'devnet' || !/devnet/.test(process.env.RPC_URL ?? '')) throw new Error('devnet only');
if (!process.argv.includes('--live')) throw new Error('This sends devnet transactions; pass --live.');

const connection = new Connection(process.env.RPC_URL!, 'confirmed');
const dbc = new DynamicBondingCurveClient(connection, 'confirmed');
const hatcher = key('creator');
const trader = key('partner');
const approver = key('devnet-squads-approver');
const destA = key('devnet-link-owner-test').publicKey;
const destB = key('devnet-link-owner2-test').publicKey;

const { submitClaim, adminVoteTx, syncClaim } = await import('../src/lib/server/links/claims.ts');
const { vaultEnv, vaultTransactionInstructions, proposalState } = await import('../src/lib/server/links/squads.ts');
const { getClaim } = await import('../src/lib/server/links/store.ts');
const v = vaultEnv();
if (!v.approver.equals(approver.publicKey)) throw new Error('LINK_APPROVER is not the devnet approver key');

async function send(tx: Transaction, signers: Keypair[], label: string): Promise<string> {
  const bh = await connection.getLatestBlockhash('confirmed');
  tx.feePayer ??= signers[0]!.publicKey;
  tx.recentBlockhash = bh.blockhash;
  tx.partialSign(...signers);
  const sig = await connection.sendRawTransaction(tx.serialize());
  const r = await connection.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
  if (r.value.err) throw new Error(`${label} failed: ${JSON.stringify(r.value.err)}`);
  console.log(`  ✓ ${label}: ${sig}`);
  return sig;
}

async function topUp(to: PublicKey, min: number, amount: number, label: string) {
  if ((await connection.getBalance(to)) >= min) return;
  await send(new Transaction().add(SystemProgram.transfer({ fromPubkey: hatcher.publicKey, toPubkey: to, lamports: amount })), [hatcher], `fund ${label} ${short(to)} with ${sol(amount)} SOL`);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(`${path} ${res.status}: ${json.error}`);
  return json;
}

async function hatch(url: string) {
  const prep = await post<{ canonicalId: string; available?: true; exists?: { mint: string | null }; suggested?: { name: string; ticker: string; imageUrl: string | null } }>('/api/links/prepare', { url });
  if (prep.exists?.mint) {
    console.log(`  ${prep.canonicalId} already hatched: ${prep.exists.mint}`);
    const link = await (await fetch(`${BASE}/api/links/by-mint?mint=${prep.exists.mint}`)).json();
    return { canonicalId: prep.canonicalId, mint: prep.exists.mint, pool: null as string | null, link };
  }
  if (!prep.available) throw new Error(`${prep.canonicalId} is not available`);
  const h = await post<{ transaction: string; mint: string; pool: string; canonicalId: string }>('/api/links/hatch', { url, wallet: hatcher.publicKey.toBase58(), name: prep.suggested!.name, ticker: prep.suggested!.ticker, imageUrl: prep.suggested!.imageUrl ?? undefined, firstBuySol: '0.01' });
  const tx = Transaction.from(Buffer.from(h.transaction, 'base64'));
  tx.partialSign(hatcher);
  const sig = await connection.sendRawTransaction(tx.serialize());
  const bh = await connection.getLatestBlockhash('confirmed');
  await connection.confirmTransaction({ signature: sig, ...bh }, 'confirmed');
  await post('/api/links/confirm', { canonicalId: h.canonicalId, signature: sig });
  console.log(`  ✓ hatched ${h.canonicalId} as $${prep.suggested!.ticker} (first buy 0.01 SOL): ${sig}`);
  console.log(`    mint ${h.mint} | pool ${h.pool}`);
  return { canonicalId: h.canonicalId, mint: h.mint, pool: h.pool };
}

async function trade(pool: PublicKey, lamports: number, label: string) {
  const vp = (await dbc.state.getPool(pool))!;
  const cfg = (await dbc.state.getPoolConfig(vp.poolState.config))!;
  const slot = await connection.getSlot();
  const now = cfg.activationType === 1 ? new BN((await connection.getBlockTime(slot))!) : new BN(slot);
  const q = dbc.pool.swapQuote2({ virtualPool: vp, config: cfg, swapBaseForQuote: false, hasReferral: false, eligibleForFirstSwapWithMinFee: false, currentPoint: now, slippageBps: 5000, swapMode: SwapMode.ExactIn, amountIn: new BN(lamports) });
  const tx = await dbc.pool.swap2({ owner: trader.publicKey, pool, swapBaseForQuote: false, referralTokenAccount: null, swapMode: SwapMode.ExactIn, amountIn: new BN(lamports), minimumAmountOut: q.minimumAmountOut! });
  await send(tx, [trader], label);
}

async function creatorFee(pool: PublicKey) {
  const s = (await dbc.state.getPool(pool))!.poolState;
  return { creator: s.creator, fee: BigInt(s.creatorQuoteFee.toString()) };
}

async function run(action: 'claim' | 'disown', url: string, destination: PublicKey) {
  console.log(`\n--- ${action}: ${url} -> ${destination.toBase58()} ---`);
  const coin = await hatch(url);
  const pool = new PublicKey(coin.pool ?? (await (await fetch(`${BASE}/api/links/claim/info?mint=${coin.mint}`)).json()).pool);
  await trade(pool, 20_000_000, 'trade 1: buy 0.02 SOL (second wallet)');
  await sleep(6_000);
  await trade(pool, 20_000_000, 'trade 2: buy 0.02 SOL (second wallet)');
  const before = await creatorFee(pool);
  console.log(`  [held] creator ${short(before.creator)} (the vault: ${before.creator.equals(v.vaultPda)}) | creator fees held: ${sol(before.fee)} SOL`);

  // SIMULATED verification: what the GitHub callback produces for the repo's owner (octocat, id 583231).
  const verified = { mint: coin.mint, canonicalId: coin.canonicalId, platform: 'github' as const, accountId: '583231', login: 'octocat', verifiedAt: new Date().toISOString(), exp: Date.now() + 30 * 60_000 };
  const destBefore = await connection.getBalance(destination);
  const serverBefore = await connection.getBalance(v.server.publicKey);
  const { claim } = (await submitClaim(verified, { mint: coin.mint, action, destination: destination.toBase58() })) as { claim: { id: string } };
  const row = (await getClaim(claim.id))!;
  console.log(`  ✓ claim ${row.id} ${row.status} | proposal ${row.squads_proposal} (#${row.transaction_index}) | held at proposal ${sol(row.held_lamports ?? 0)} SOL`);
  for (const s of row.propose_signatures) console.log(`    server (Initiate) signature: ${s}`);

  // The proposal's contents, read back from chain.
  const ixs = await vaultTransactionInstructions(connection, v, BigInt(row.transaction_index!));
  const name = (p: PublicKey) => (p.equals(DYNAMIC_BONDING_CURVE_PROGRAM_ID) ? 'DBC' : p.equals(TOKEN_PROGRAM_ID) ? 'SPL Token' : p.equals(TOKEN_2022_PROGRAM_ID) ? 'Token-2022' : p.toBase58());
  const wsol = getAssociatedTokenAddressSync(new PublicKey('So11111111111111111111111111111111111111112'), v.vaultPda, true);
  console.log(`  [proposal] ${ixs.length} instructions:`);
  ixs.forEach((ix, i) => console.log(`    ${i + 1}. ${name(ix.programId)} ${ix.accounts.some((a) => a.equals(destination)) ? `(names destination ${short(destination)})` : ''}${ix.accounts.some((a) => a.equals(wsol)) ? ' (vault WSOL account)' : ''}`));
  const ok = ixs.length >= 3 && name(ixs[0]!.programId) === 'DBC' && name(ixs[1]!.programId) === 'SPL Token' && ixs[1]!.accounts[1]!.equals(destination) && name(ixs[2]!.programId) === 'DBC' && ixs[2]!.accounts.some((a) => a.equals(destination));
  console.log(`  [proposal] claim fees -> vault WSOL, close WSOL -> destination, transferPoolCreator -> destination: ${ok ? 'OK' : 'MISMATCH'}`);
  if (!ok) throw new Error('proposal contents mismatch');

  // The server key cannot vote.
  try {
    await multisig.rpc.proposalApprove({ connection, feePayer: v.server, member: v.server, multisigPda: v.multisigPda, transactionIndex: BigInt(row.transaction_index!) });
    console.log('  [negative check] server votes: ACCEPTED (unexpected)');
    throw new Error('server voted');
  } catch (e) {
    const logs = (e as { logs?: string[] }).logs ?? [];
    console.log(`  [negative check] server key votes on its own proposal: REJECTED ${(logs.find((l) => /Error Code/.test(l)) ?? (e as Error).message).replace(/^.*Error Code: /, 'Error Code: ').slice(0, 120)}`);
  }
  console.log(`  [state] proposal before the vote: ${(await proposalState(connection, v, BigInt(row.transaction_index!))).state}`);

  // The approver votes (this is what /admin/claims has the approver's wallet sign).
  const { transaction } = await adminVoteTx(approver.publicKey, { claimId: row.id, vote: 'approve' });
  const voteTx = Transaction.from(Buffer.from(transaction, 'base64'));
  const voteSig = await send(voteTx, [approver], 'approver votes (approve)');
  const synced = await syncClaim(row.id, voteSig);
  const after = await creatorFee(pool);
  const done = (await getClaim(row.id))!;
  const destAfter = await connection.getBalance(destination);
  const serverAfter = await connection.getBalance(v.server.publicKey);
  console.log(`  ✓ server executes: ${done.execute_signature}`);
  console.log(`  [result] claim ${done.status} | sync -> ${JSON.stringify(synced)}`);
  console.log(`  [result] held before ${sol(before.fee)} SOL | destination received ${sol(done.received_lamports ?? 0)} SOL in the handover (balance ${sol(destBefore)} -> ${sol(destAfter)}) | pool creator fee left ${sol(after.fee)} SOL`);
  console.log(`  [result] on-chain creator after: ${after.creator.toBase58()} (= destination: ${after.creator.equals(destination)})`);
  console.log(`  [result] Hatch (server key) paid ${sol(serverBefore - serverAfter)} SOL in fees and rent; the owner paid nothing`);
  const link = await (await fetch(`${BASE}/api/links/by-mint?mint=${coin.mint}`)).json();
  console.log(`  [result] link status now: ${link.link?.status} | claimed wallet ${link.link?.claimedWallet}`);
}

console.log(`=== link claim e2e [devnet] vault ${v.vaultPda.toBase58()} | multisig ${v.multisigPda.toBase58()} ===`);
await topUp(v.server.publicKey, 150_000_000, 200_000_000, 'server (Hatch pays fees)');
await topUp(approver.publicKey, 10_000_000, 20_000_000, 'approver');
await run('claim', CLAIM_URL, destA);
await run('disown', DISOWN_URL, destB);
