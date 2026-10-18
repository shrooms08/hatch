// DEVNET proof: claiming a GRADUATED link coin through the app's claim engine.
//   1. Hatch a test link coin with the app's one-transaction builder (one-time creator key -> creator role to the
//      vault) under the DEVNET TEST config (LINK-v1 except a 0.5 SOL threshold; scripts/src/create-config-link-grad-test-devnet.ts).
//   2. Fill the curve, then try a claim in the gap (curve complete, not migrated): must be refused with the
//      friendly message, before anything is recorded or sent.
//   3. Migrate to DAMM v2; both positions permanently locked, the vault holds the creator position NFT.
//   4. Trade on the DAMM v2 pool so LP fees accrue.
//   5. Claim through the claim engine (owner sign-in STUBBED; everything else real): one Squads proposal with the
//      creator fee claim, the creator role and the position NFT; Hatch creates the owner's NFT account; the server
//      key cannot vote; the script approver votes; the server executes.
//   6. The owner holds the NFT, claims the DAMM v2 LP fees with their own signature, and cannot withdraw liquidity.
// Devnet only; keys from scripts/keys (gitignored), never printed. Needs --live.
//   node --env-file=.env.local --import tsx scripts/link-graduate-claim-devnet.mts --live
import { readFileSync } from 'node:fs';
import { createPrivateKey, randomBytes, sign as edSign } from 'node:crypto';
import BN from 'bn.js';
import bs58 from 'bs58';
import * as multisig from '@sqds/multisig';
import { ComputeBudgetProgram, Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { NATIVE_MINT, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { DAMM_V2_MIGRATION_FEE_ADDRESS, DYNAMIC_BONDING_CURVE_PROGRAM_ID, DynamicBondingCurveClient, SwapMode, deriveDammV2PoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { CpAmm, derivePositionAddress, derivePositionNftAccount } from '@meteora-ag/cp-amm-sdk';

const TEST_CONFIG = new PublicKey('DcmFLoyPShNqoE3tUC78yW29XD5Lfa5E6z611pajU61P'); // devnet TEST config (0.5 SOL threshold)
if (process.env.NEXT_PUBLIC_SOLANA_NETWORK !== 'devnet' || !/devnet/.test(process.env.RPC_URL ?? '')) throw new Error('devnet only');
if (!process.argv.includes('--live')) throw new Error('This sends devnet transactions; pass --live.');

const sol = (l: bigint | number | BN | string) => (Number(l.toString()) / 1e9).toFixed(9);
const short = (k: PublicKey | string) => `${k.toString().slice(0, 4)}…${k.toString().slice(-4)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const key = (name: string) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(new URL(`../../scripts/keys/${name}.json`, import.meta.url), 'utf8')) as number[]));
const walletSign = (kp: Keypair, message: string) =>
  bs58.encode(edSign(null, Buffer.from(message, 'utf8'), createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(kp.secretKey.subarray(0, 32))]), format: 'der', type: 'pkcs8' })));

const connection = new Connection(process.env.RPC_URL!, 'confirmed');
const dbc = new DynamicBondingCurveClient(connection, 'confirmed');
const cp = new CpAmm(connection);
const hatcher = key('creator');
const partner = key('partner');
const approver = key('devnet-squads-approver');
const owner = key('devnet-link-owner-test');

const { buildLinkHatchTx } = await import('../src/lib/server/links/chain.ts');
const store = await import('../src/lib/server/links/store.ts');
const { issueNonce, submitClaim, adminVoteTx, syncClaim, claimInfo } = await import('../src/lib/server/links/claims.ts');
const { vaultEnv, vaultTransactionInstructions } = await import('../src/lib/server/links/squads.ts');
const { linkIdHash } = await import('../src/lib/links/canonical.ts');
const v = vaultEnv();
const sigs: Record<string, string> = {};

async function send(tx: Transaction, signers: Keypair[], label: string, cu?: number): Promise<string> {
  const hasLimit = tx.instructions.some((ix) => ix.programId.equals(ComputeBudgetProgram.programId) && ix.data[0] === 2);
  if (cu && !hasLimit) tx.instructions.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: cu }));
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

async function poolState(pool: PublicKey) {
  const vp = (await dbc.state.getPool(pool))!;
  const cfg = (await dbc.state.getPoolConfig(vp.poolState.config))!;
  return { vp, cfg, s: vp.poolState };
}

async function nowPoint(activationType: number) {
  const slot = await connection.getSlot();
  return activationType === 1 ? new BN((await connection.getBlockTime(slot))!) : new BN(slot);
}

async function verifiedFor(link: { mint: string; canonical_id: string }) {
  // STUBBED owner sign-in (exactly the shape the GitHub callback produces).
  return { mint: link.mint, canonicalId: link.canonical_id, platform: 'github' as const, accountId: '424242', login: 'grad-test-owner', verifiedAt: new Date().toISOString(), exp: Date.now() + 30 * 60_000, trust: { platform: 'github' as const, accountCreatedAt: '2015-01-01T00:00:00Z', followers: 100, stars: 100, platformVerified: null, renamedOrTransferred: false, checkedAt: new Date().toISOString() } };
}

console.log(`=== graduated-pool claim proof [devnet] test config ${TEST_CONFIG.toBase58()} | vault ${v.vaultPda.toBase58()} ===`);
const tc = await dbc.state.getPoolConfig(TEST_CONFIG);
if (!tc) throw new Error('test config missing: run scripts/src/create-config-link-grad-test-devnet.ts --live');
console.log(`  test config threshold ${sol(tc.migrationQuoteThreshold)} SOL | creator fee share ${tc.creatorTradingFeePercentage}% | locked LP ${tc.creatorPermanentLockedLiquidityPercentage}/${tc.partnerPermanentLockedLiquidityPercentage}%`);

// ---------- 1. hatch (the app's one-transaction builder, creator role -> vault) ----------
// --resume <canonical id>: continue with an earlier run's coin (skips the hatch and the fill when already done).
const resumeAt = process.argv.indexOf('--resume');
const resumed = resumeAt >= 0 ? await store.getLink('devnet', process.argv[resumeAt + 1]!) : null;
const canonicalId = resumed?.canonical_id ?? `gh:repo:hatch-graduation-test/proof-${randomBytes(4).toString('hex')}`;
const baseMint = Keypair.generate();
let built: { mint: string; pool: string; transaction: string; lastValidBlockHeight: number };
if (resumed) {
  built = { mint: resumed.mint!, pool: resumed.pool!, transaction: '', lastValidBlockHeight: 0 };
  console.log(`  resuming ${canonicalId} | mint ${built.mint} | pool ${built.pool}`);
} else {
built = await buildLinkHatchTx({ connection, config: TEST_CONFIG, vault: v.vaultPda, payer: hatcher.publicKey, baseMint, name: 'Graduation Proof', symbol: 'GRAD', uri: 'https://example.com/hatch/graduation-proof.json', firstBuyLamports: 10_000_000 });
const reserved = await store.reserveLink(
  {
    network: 'devnet', canonical_id: canonicalId, id_hash: await linkIdHash(canonicalId), kind: 'github_repo', display_url: `https://github.com/${canonicalId.slice(8)}`, title: 'Graduation proof (devnet test)', image_url: null,
    owner_platform: 'github', owner_handle: 'hatch-graduation-test', owner_id: null, coin_name: 'Graduation Proof', coin_ticker: 'GRAD', metadata_url: null, mint: built.mint, pool: built.pool, config: TEST_CONFIG.toBase58(),
    hatched_by: hatcher.publicKey.toBase58(), first_buy_lamports: 10_000_000, github_repo_id: null,
  },
  { prevMint: null }
);
if (!reserved) throw new Error('reservation failed');
const hatchTx = Transaction.from(Buffer.from(built.transaction, 'base64'));
hatchTx.partialSign(hatcher);
sigs.hatch = await connection.sendRawTransaction(hatchTx.serialize());
await connection.confirmTransaction({ signature: sigs.hatch, blockhash: hatchTx.recentBlockhash!, lastValidBlockHeight: built.lastValidBlockHeight }, 'confirmed');
await store.markHatched('devnet', canonicalId, built.mint);
console.log(`  ✓ hatch (one transaction: pool + 0.01 SOL first buy + creator -> vault): ${sigs.hatch}`);
}
const pool = new PublicKey(built.pool);
console.log(`    ${canonicalId} | mint ${built.mint} | pool ${built.pool} | creator now ${short((await poolState(pool)).s.creator)} (vault: ${(await poolState(pool)).s.creator.equals(v.vaultPda)})`);

// ---------- 2. fill the curve, then the gap refusal ----------
const filled = await (async () => { const { s, cfg } = await poolState(pool); return s.isMigrated === 1 || s.quoteReserve.gte(cfg.migrationQuoteThreshold); })();
if (!filled) {
console.log('  waiting 65 s for the sniper shield to end before filling the curve…');
await sleep(65_000);
  const { vp, cfg, s } = await poolState(pool);
  const amountIn = cfg.migrationQuoteThreshold.sub(s.quoteReserve).muln(115).divn(100);
  const q = dbc.pool.swapQuote2({ virtualPool: vp, config: cfg, swapBaseForQuote: false, hasReferral: false, eligibleForFirstSwapWithMinFee: false, currentPoint: await nowPoint(cfg.activationType), slippageBps: 1000, swapMode: SwapMode.PartialFill, amountIn });
  const tx = await dbc.pool.swap2({ owner: hatcher.publicKey, pool, swapBaseForQuote: false, referralTokenAccount: null, swapMode: SwapMode.PartialFill, amountIn, minimumAmountOut: q.minimumAmountOut! });
  sigs.curveComplete = await send(tx, [hatcher], `fill the curve (buy up to ${sol(amountIn)} SOL, partial fill)`);
}
{
  const { s, cfg } = await poolState(pool);
  console.log(`  [state] quote reserve ${sol(s.quoteReserve)} / threshold ${sol(cfg.migrationQuoteThreshold)} | migrated ${s.isMigrated} | creator fees held ${sol(s.creatorQuoteFee)} SOL`);
}
const linkRow = (await store.getLink('devnet', canonicalId))!;
const verified = await verifiedFor({ mint: built.mint, canonical_id: canonicalId });
const info = await claimInfo(built.mint, verified);
console.log(`  [gap] claim page sees phase "${info.phase}"`);
if (info.phase === 'gap') {
const n0 = await issueNonce(verified, { mint: built.mint, wallet: owner.publicKey.toBase58() });
const gap = await submitClaim(verified, { mint: built.mint, action: 'claim', destination: owner.publicKey.toBase58(), nonce: n0.nonce, signature: walletSign(owner, n0.message) }).then(
  () => 'ACCEPTED (unexpected)',
  (e: Error & { status?: number }) => `REFUSED ${e.status} "${e.message}"`
);
console.log(`  [gap] claim submitted between curve completion and migration: ${gap}`);
console.log(`  [gap] claims recorded for this link: ${(await store.claimsForLink('devnet', canonicalId)).filter((c) => ['pending', 'proposed', 'approved'].includes(c.status)).length} open (nothing proposed, nothing sent)`);
}

// ---------- 3. migrate to DAMM v2 ----------
let dammPool: PublicKey;
let nfts: PublicKey[];
{
  const { s, cfg } = await poolState(pool);
  const dammConfig = DAMM_V2_MIGRATION_FEE_ADDRESS[cfg.migrationFeeOption]!;
  dammPool = deriveDammV2PoolAddress(dammConfig, s.baseMint, cfg.quoteMint);
  if (s.isMigrated === 1) {
    // Resumed after migration: find the two position NFTs by scanning the vault's and the partner's Token-2022 accounts.
    nfts = [];
    for (const who of [v.vaultPda, partner.publicKey, owner.publicKey]) {
      const accts = await connection.getParsedTokenAccountsByOwner(who, { programId: TOKEN_2022_PROGRAM_ID });
      for (const a of accts.value) {
        const i = (a.account.data as { parsed?: { info?: { mint?: string; tokenAmount?: { amount?: string; decimals?: number } } } }).parsed?.info;
        if (!i?.mint || i.tokenAmount?.amount !== '1' || i.tokenAmount.decimals !== 0) continue;
        const pos = await cp.fetchPositionState(derivePositionAddress(new PublicKey(i.mint))).catch((): null => null);
        if (pos && (pos as { pool: PublicKey }).pool.equals(dammPool)) nfts.push(new PublicKey(i.mint));
      }
    }
    console.log(`  already migrated: DAMM v2 pool ${dammPool.toBase58()} | positions found: ${nfts.length}`);
  } else {
    const { transaction, firstPositionNftKeypair, secondPositionNftKeypair } = await dbc.migration.migrateToDammV2({ payer: partner.publicKey, pool, dammConfig });
    sigs.migration = await send(transaction, [partner, firstPositionNftKeypair, secondPositionNftKeypair], 'migrate to DAMM v2 (creator = the vault)', 1_000_000);
    nfts = [firstPositionNftKeypair.publicKey, secondPositionNftKeypair.publicKey];
    console.log(`  DAMM v2 pool ${dammPool.toBase58()} | DBC migrated flag ${(await poolState(pool)).s.isMigrated}`);
  }
}
let creatorNft: PublicKey | null = null;
for (const nft of nfts) {
  const acct = await connection.getParsedAccountInfo(derivePositionNftAccount(nft));
  const holder = (acct.value?.data as { parsed?: { info?: { owner?: string } } })?.parsed?.info?.owner ?? '?';
  const pos = await cp.fetchPositionState(derivePositionAddress(nft));
  const role = holder === v.vaultPda.toBase58() ? 'CREATOR position, held by the vault' : holder === partner.publicKey.toBase58() ? 'PARTNER position, held by the partner' : `held by ${holder}`;
  if (holder === v.vaultPda.toBase58()) creatorNft = nft;
  console.log(`  [position] NFT ${nft.toBase58()} (${role}): withdrawable ${pos.unlockedLiquidity.toString()} | vesting ${pos.vestedLiquidity.toString()} | permanently locked ${pos.permanentLockedLiquidity.toString()}`);
}
if (!creatorNft) throw new Error('the vault does not hold the creator position NFT');

// ---------- 4. trades on DAMM v2 ----------
const d = await cp.fetchPoolState(dammPool);
const progOf = (mint: PublicKey) => (mint.equals(NATIVE_MINT) ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID);
const common = { pool: dammPool, tokenAMint: d.tokenAMint, tokenBMint: d.tokenBMint, tokenAVault: d.tokenAVault, tokenBVault: d.tokenBVault, tokenAProgram: progOf(d.tokenAMint), tokenBProgram: progOf(d.tokenBMint) };
const baseOnDamm = d.tokenAMint.equals(NATIVE_MINT) ? d.tokenBMint : d.tokenAMint;
// A resumed run after migration already traded on DAMM v2 (the LP fees are there): skip.
for (const [i, lamports] of (sigs.migration ? [50_000_000, 30_000_000] : []).entries()) {
  const tx = await cp.swap({ payer: hatcher.publicKey, inputTokenMint: NATIVE_MINT, outputTokenMint: baseOnDamm, amountIn: new BN(lamports), minimumAmountOut: new BN(0), referralTokenAccount: null, ...common } as Parameters<CpAmm['swap']>[0]);
  sigs[`dammTrade${i + 1}`] = await send(tx, [hatcher], `DAMM v2 trade ${i + 1}: buy with ${sol(lamports)} SOL`);
}

// ---------- 5. claim through the claim engine ----------
for (const c of (await store.claimsForLink('devnet', canonicalId)).filter((c) => ['proposed', 'approved'].includes(c.status))) {
  // An earlier run's proposal that cannot execute (approved with the old NFT source account): the approver cancels it.
  const { transaction } = await adminVoteTx(approver.publicKey, { claimId: c.id, vote: c.status === 'approved' ? 'cancel' : 'reject' });
  const sig = await send(Transaction.from(Buffer.from(transaction, 'base64')), [approver], `approver ${c.status === 'approved' ? 'cancels' : 'rejects'} the earlier stuck claim #${c.transaction_index}`);
  console.log(`    sync -> ${JSON.stringify(await syncClaim(c.id, sig))}`);
}
const { s: before } = await poolState(pool);
console.log(`  [held] DBC creator fees still unclaimed: ${sol(before.creatorQuoteFee)} SOL | DBC creator ${short(before.creator)}`);
const n1 = await issueNonce(verified, { mint: built.mint, wallet: owner.publicKey.toBase58() });
const { claim } = (await submitClaim(verified, { mint: built.mint, action: 'claim', destination: owner.publicKey.toBase58(), nonce: n1.nonce, signature: walletSign(owner, n1.message) })) as { claim: { id: string } };
const row = (await store.getClaim(claim.id))!;
sigs.proposalSetup = row.propose_signatures[0]!;
sigs.proposal = row.propose_signatures[1]!;
console.log(`  ✓ claim ${row.status}: proposal ${row.squads_proposal} (#${row.transaction_index})`);
console.log(`    setup (Hatch pays: vault fee accounts + the owner's NFT token account): ${sigs.proposalSetup}`);
console.log(`    vault transaction + proposal: ${sigs.proposal}`);
const ownerNftAta = getAssociatedTokenAddressSync(creatorNft, owner.publicKey, true, TOKEN_2022_PROGRAM_ID);
const ataInfo = await connection.getAccountInfo(ownerNftAta);
console.log(`  [setup] owner's NFT token account ${short(ownerNftAta)} exists before the vote: ${!!ataInfo} (rent paid by Hatch's server key)`);
const ixs = await vaultTransactionInstructions(connection, v, BigInt(row.transaction_index!));
const name = (p: PublicKey) => (p.equals(DYNAMIC_BONDING_CURVE_PROGRAM_ID) ? 'DBC' : p.equals(TOKEN_PROGRAM_ID) ? 'SPL Token' : p.equals(TOKEN_2022_PROGRAM_ID) ? 'Token-2022' : p.toBase58());
console.log(`  [proposal] ${ixs.length} instructions:`);
const labels = ['DBC claimCreatorTradingFee -> vault WSOL account', 'SPL Token closeAccount (vault WSOL) -> owner', 'DBC transferPoolCreator -> owner', 'Token-2022 transferChecked: creator position NFT -> owner'];
ixs.forEach((ix, i) => console.log(`    ${i + 1}. ${name(ix.programId)}: ${labels[i] ?? '?'}${ix.accounts.some((a) => a.equals(creatorNft!)) ? ` (NFT ${short(creatorNft!)})` : ''}`));
const ok =
  ixs.length === 4 && name(ixs[0]!.programId) === 'DBC' && name(ixs[1]!.programId) === 'SPL Token' && name(ixs[2]!.programId) === 'DBC' && name(ixs[3]!.programId) === 'Token-2022' &&
  ixs[3]!.accounts[0]!.equals(derivePositionNftAccount(creatorNft)) && ixs[3]!.accounts.some((a) => a.equals(ownerNftAta));
console.log(`  [proposal] NFT moves from the position NFT account ${short(derivePositionNftAccount(creatorNft))} to the owner's ${short(ownerNftAta)}`);
console.log(`  [proposal] fee claim + creator role + NFT transfer to the owner's account: ${ok ? 'OK' : 'MISMATCH'}`);
if (!ok) throw new Error('proposal contents mismatch');
try {
  await multisig.rpc.proposalApprove({ connection, feePayer: v.server, member: v.server, multisigPda: v.multisigPda, transactionIndex: BigInt(row.transaction_index!) });
  throw new Error('server voted');
} catch (e) {
  const logs = (e as { logs?: string[] }).logs ?? [];
  console.log(`  [negative check] server key votes: REJECTED ${(logs.find((l) => /Error Code/.test(l)) ?? (e as Error).message).replace(/^.*Error Code: /, 'Error Code: ').slice(0, 110)}`);
}
const { transaction: voteB64 } = await adminVoteTx(approver.publicKey, { claimId: row.id, vote: 'approve' });
sigs.vote = await send(Transaction.from(Buffer.from(voteB64, 'base64')), [approver], 'approver votes (approve)');
const synced = await syncClaim(row.id, sigs.vote);
sigs.execute = (synced as { executeSignature?: string }).executeSignature ?? '(none)';
console.log(`  ✓ server executes: ${sigs.execute} | claim ${(await store.getClaim(row.id))!.status} | received ${sol((synced as { receivedLamports?: number }).receivedLamports ?? 0)} SOL`);

// ---------- 6. the owner's NFT, LP fees, and the lock ----------
const { s: after } = await poolState(pool);
const nftBal = await connection.getTokenAccountBalance(ownerNftAta).catch((): null => null);
console.log(`  [result] DBC creator after: ${after.creator.toBase58()} (= owner: ${after.creator.equals(owner.publicKey)})`);
console.log(`  [result] owner holds the creator position NFT: ${nftBal?.value.amount === '1'} (amount ${nftBal?.value.amount}) | vault still holds it: ${(await connection.getTokenAccountBalance(derivePositionNftAccount(creatorNft)).catch((): null => null))?.value.amount === '1'}`);
const position = derivePositionAddress(creatorNft);
const solBefore = await connection.getBalance(owner.publicKey);
const ownerBase = getAssociatedTokenAddressSync(baseOnDamm, owner.publicKey, false, TOKEN_2022_PROGRAM_ID);
const baseBefore = (await connection.getTokenAccountBalance(ownerBase).catch((): null => null))?.value.uiAmountString ?? '0';
const claimFeeTx = await cp.claimPositionFee({ owner: owner.publicKey, position, positionNftAccount: ownerNftAta, feePayer: owner.publicKey, ...common } as Parameters<CpAmm['claimPositionFee']>[0]);
sigs.ownerLpFeeClaim = await send(claimFeeTx, [owner], 'OWNER claims DAMM v2 LP fees from the locked creator position (own signature, own fee)');
const solAfter = await connection.getBalance(owner.publicKey);
const baseAfter = (await connection.getTokenAccountBalance(ownerBase).catch((): null => null))?.value.uiAmountString ?? '0';
console.log(`  [LP fees] owner SOL ${sol(solBefore)} -> ${sol(solAfter)} (${solAfter - solBefore >= 0 ? '+' : ''}${sol(solAfter - solBefore)}, after paying the network fee) | base token ${baseBefore} -> ${baseAfter}`);
const pos = await cp.fetchPositionState(position);
console.log(`  [lock] creator position: withdrawable ${pos.unlockedLiquidity.toString()} | permanently locked ${pos.permanentLockedLiquidity.toString()}`);
try {
  const tx = await cp.removeAllLiquidity({ owner: owner.publicKey, position, positionNftAccount: ownerNftAta, tokenAAmountThreshold: new BN(0), tokenBAmountThreshold: new BN(0), vestings: [], currentPoint: new BN(Math.floor(Date.now() / 1000)), ...common } as unknown as Parameters<CpAmm['removeAllLiquidity']>[0]);
  tx.feePayer = owner.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  const sim = await connection.simulateTransaction(tx);
  const line = (sim.value.logs ?? []).find((l) => /Error Code|custom program error|failed/.test(l)) ?? JSON.stringify(sim.value.err);
  console.log(`  [negative check] owner withdraws the locked liquidity: ${sim.value.err ? `REFUSED ${line.replace(/^.*Error Code: /, 'Error Code: ').slice(0, 140)}` : 'ALLOWED (unexpected)'}`);
} catch (e) {
  console.log(`  [negative check] owner withdraws the locked liquidity: REFUSED (${(e as Error).message.slice(0, 140)})`);
}

console.log('\n  signatures:');
for (const [k, s] of Object.entries(sigs)) console.log(`    ${k.padEnd(16)} ${s}`);
void linkRow;
process.exit(0);
