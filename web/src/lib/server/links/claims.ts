// Server-only: claiming a link coin (or disowning it). Generic over platforms; P4a verifies GitHub owners only.
//   1. The owner verifies (lib/server/links/github.ts) -> a signed, short-lived cookie with their PERMANENT account id.
//   2. submitClaim: one open claim per link (database-enforced), destination validated and immutable from here on,
//      then ONE Squads proposal (squads.ts): fees -> destination, creator role -> destination (+ position NFT once
//      graduated). Refused while the pool is moving to its new pool (curve complete, not migrated).
//   3. The approver votes with their own wallet on /admin/claims (adminVoteTx builds the transaction for them; the
//      server key never signs a vote).
//   4. syncClaim: once the proposal is Approved, the server executes it, checks on chain that the destination is
//      now the pool creator, and marks the claim executed and the link claimed / disowned.
// Every step is written to the append-only claim_log. Hatch pays all fees and rent; the owner pays nothing.
// Unclaimed fees are held for the owner by Hatch's vault, forever: there is no sweep.
import { createPublicKey, verify as edVerify } from 'node:crypto';
import bs58 from 'bs58';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { serverRpcUrl } from '@/lib/config/network';
import { keyLimited } from '@/lib/server/rateLimit';
import { forgetSwr } from '@/lib/server/swrCache';
import { addPriorityFee } from '@/lib/solana/priorityFee';
import { linkKeys, linkNetwork } from './chain';
import { LinkApiError } from './service';
import { GapError, approveInstruction, cancelInstruction, executeHandover, isVaultConfigured, poolPhase, proposalState, proposeHandover, rejectInstruction, vaultEnv, type ProposalState } from './squads';
import {
  ClaimOpenError,
  appendClaimLog,
  claimsByStatus,
  claimsForLink,
  getClaim,
  getLink,
  getLinkByMint,
  disputesFor,
  getNonce,
  insertClaim,
  insertDispute,
  insertNonce,
  setOwnerTrust,
  consumeNonce,
  markLinkHandedOver,
  updateClaim,
  type ClaimRow,
  type LinkNetwork,
  type LinkRow,
} from './store';
import type { VerifiedId } from './claimCookie';
import { ADMIN_MESSAGE } from '@/lib/links/claimShared';
import { randomBytes } from 'node:crypto';
import { CLAIM_PLATFORM_NAME, DEFAULT_CLAIM_TIMELOCK_SOL, DEFAULT_MIN_CLAIM_SOL, meetsMinClaim, minClaimMessage, NONCE_TTL_MS, destinationMessage, needsTimelock, timelockRemainingMs, timelockUntil, trustLabel, validateDispute, type OwnerTrust } from '@/lib/links/claimRules';

const connection = () => new Connection(serverRpcUrl(), 'confirmed');
const OPEN: ClaimRow['status'][] = ['pending', 'proposed', 'approved'];

/** Platforms whose owners can verify in this build. */
export const CLAIM_PLATFORMS = { github_repo: 'github', youtube_video: 'youtube', x_post: 'x' } as const;

export function claimNetwork(): LinkNetwork {
  const n = linkNetwork();
  if (!n || !isVaultConfigured()) throw new LinkApiError(404, 'Link coin claims are not available on this network yet');
  return n;
}

export function parseMint(mint: unknown): string {
  try {
    return new PublicKey(String(mint ?? '')).toBase58();
  } catch {
    throw new LinkApiError(400, 'mint is invalid');
  }
}

/** A destination must be a real wallet: a valid address ON the ed25519 curve (not a program-derived address). */
export function validDestination(raw: unknown): PublicKey {
  let k: PublicKey;
  try {
    k = new PublicKey(String(raw ?? '').trim());
  } catch {
    throw new LinkApiError(400, 'That is not a Solana address');
  }
  if (!PublicKey.isOnCurve(k.toBytes())) throw new LinkApiError(400, 'That address is not a wallet (it is a program account). Use a normal Solana wallet address.');
  if (k.equals(PublicKey.default)) throw new LinkApiError(400, 'That is not a usable wallet address');
  return k;
}

export async function linkForClaim(network: LinkNetwork, mint: string): Promise<LinkRow> {
  const link = await getLinkByMint(network, mint);
  if (!link || !link.pool || !['hatched', 'claimed', 'disowned'].includes(link.status)) throw new LinkApiError(404, 'No link coin with this mint');
  return link;
}

export async function poolOnChain(pool: string) {
  const client = new DynamicBondingCurveClient(connection(), 'confirmed');
  const vp = await client.state.getPool(new PublicKey(pool));
  if (!vp) throw new LinkApiError(502, 'Could not read the pool on chain. Try again.');
  const cfg = await client.state.getPoolConfig(vp.poolState.config);
  if (!cfg) throw new LinkApiError(502, 'Could not read the pool config. Try again.');
  return { state: vp.poolState, phase: poolPhase(vp.poolState, cfg.migrationQuoteThreshold) };
}

const publicClaim = (c: ClaimRow | undefined) =>
  c
    ? { id: c.id, status: c.status, action: c.action, destination: c.destination, createdAt: c.created_at, executeSignature: c.execute_signature, receivedLamports: c.received_lamports, timelockUntil: c.timelock_until }
    : null;

/** A claim or disown can only be submitted once the coin holds at least this much (SOL). MIN_CLAIM_SOL overrides. */
export function minClaimSol(): number {
  const raw = process.env.MIN_CLAIM_SOL;
  const v = Number(raw);
  return raw !== undefined && raw !== '' && Number.isFinite(v) && v >= 0 ? v : DEFAULT_MIN_CLAIM_SOL;
}

/** Claims holding at least this much (SOL, at proposal time) wait 48 h before they can execute. CLAIM_TIMELOCK_SOL overrides. */
export function claimTimelockSol(): number {
  const v = Number(process.env.CLAIM_TIMELOCK_SOL);
  return process.env.CLAIM_TIMELOCK_SOL !== undefined && process.env.CLAIM_TIMELOCK_SOL !== '' && Number.isFinite(v) && v >= 0 ? v : DEFAULT_CLAIM_TIMELOCK_SOL;
}

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
/** ed25519 check of a wallet's signature (base58) over a UTF-8 message. */
export function walletSigned(message: string, signatureB58: unknown, wallet: PublicKey): boolean {
  let sig: Uint8Array;
  try {
    sig = bs58.decode(String(signatureB58 ?? ''));
  } catch {
    return false;
  }
  if (sig.length !== 64) return false;
  const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, wallet.toBuffer()]), format: 'der', type: 'spki' });
  return edVerify(null, Buffer.from(message, 'utf8'), key, Buffer.from(sig));
}

// ---------- the claim page ----------

export async function claimInfo(mintRaw: unknown, verified: VerifiedId | null) {
  const network = claimNetwork();
  const mint = parseMint(mintRaw);
  const link = await linkForClaim(network, mint);
  const { state, phase } = await poolOnChain(link.pool!);
  const claims = await claimsForLink(network, link.canonical_id);
  const open = claims.find((c) => OPEN.includes(c.status));
  const done = claims.find((c) => c.status === 'executed');
  return {
    mint,
    pool: link.pool,
    canonicalId: link.canonical_id,
    kind: link.kind,
    displayUrl: link.display_url,
    title: link.title,
    coinName: link.coin_name,
    ticker: link.coin_ticker,
    owner: { platform: link.owner_platform, handle: link.owner_handle },
    status: link.status,
    claimedWallet: link.claimed_wallet,
    /** Creator fees accrued in the pool and not claimed yet (lamports), read from chain now. */
    heldLamports: state.creatorQuoteFee.toString(),
    phase,
    creator: state.creator.toBase58(),
    canVerify: link.kind in CLAIM_PLATFORMS,
    platform: CLAIM_PLATFORMS[link.kind as keyof typeof CLAIM_PLATFORMS] ?? null,
    verified:
      verified && verified.mint === mint
        ? { platform: verified.platform, login: verified.login, accountId: verified.accountId, verifiedAt: verified.verifiedAt, trust: verified.trust ?? null, trustLabel: trustLabel(verified.trust) }
        : null,
    /** Trust signals of the account that last verified ownership (shown on the coin). */
    ownerTrust: link.owner_trust ?? null,
    ownerTrustLabel: trustLabel(link.owner_trust),
    timelockSol: claimTimelockSol(),
    /** Claims open once the coin holds this much; below it the claim page explains and disables the button. */
    minClaimSol: minClaimSol(),
    meetsMinClaim: meetsMinClaim(state.creatorQuoteFee.toString(), minClaimSol()),
    openClaim: publicClaim(open),
    lastClaim: publicClaim(done),
  };
}

/** Called right after a successful verification: logs who verified, when, for which link. */
export async function logVerified(v: VerifiedId) {
  const network = claimNetwork();
  await appendClaimLog({ network, claim_id: null, canonical_id: v.canonicalId, event: 'verified', platform: v.platform, account_id: v.accountId, account_login: v.login, detail: { mint: v.mint, verifiedAt: v.verifiedAt, trust: v.trust ?? null, evidence: v.evidence ?? null, identity: v.platform === 'x' ? 'X handle at claim time' : 'account id' } });
  if (v.trust) await setOwnerTrust(network, v.canonicalId, v.trust);
}

/**
 * Step before submitting: a one-time message the DESTINATION wallet signs (free, no transaction). Bound to this coin,
 * the verified account and that wallet; expires in 10 minutes; usable once.
 */
export async function issueNonce(verified: VerifiedId | null, body: { mint?: unknown; wallet?: unknown }) {
  const network = claimNetwork();
  const mint = parseMint(body.mint);
  if (!verified || verified.mint !== mint) throw new LinkApiError(401, 'Verify that you own this link first');
  if (keyLimited(`claim-nonce:${verified.platform}:${verified.accountId}`, 20, 60 * 60_000)) throw new LinkApiError(429, 'Too many attempts for this account. Try again in an hour.');
  const wallet = validDestination(body.wallet).toBase58();
  const link = await linkForClaim(network, mint);
  if (link.canonical_id !== verified.canonicalId) throw new LinkApiError(401, 'Verify that you own this link first');
  if (link.status !== 'hatched') throw new LinkApiError(409, 'This coin was already claimed or disowned');
  const { state } = await poolOnChain(link.pool!);
  if (!meetsMinClaim(state.creatorQuoteFee.toString(), minClaimSol())) throw new LinkApiError(409, minClaimMessage(minClaimSol()));
  const nonce = randomBytes(16).toString('hex');
  const message = destinationMessage({ ticker: link.coin_ticker, mint, platform: CLAIM_PLATFORM_NAME[verified.platform] ?? verified.platform, login: verified.login, accountId: verified.accountId, wallet, nonce, date: new Date().toISOString().slice(0, 10) });
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS).toISOString();
  await insertNonce({ nonce, network, mint, platform: verified.platform, account_id: verified.accountId, wallet, message, expires_at: expiresAt });
  return { nonce, message, expiresAt };
}
export async function logRefused(p: { canonicalId: string; platform: string; reason: string }) {
  await appendClaimLog({ network: claimNetwork(), claim_id: null, canonical_id: p.canonicalId, event: 'verify-refused', platform: p.platform, detail: { reason: p.reason } });
}

export async function submitClaim(verified: VerifiedId | null, body: { mint?: unknown; action?: unknown; destination?: unknown; nonce?: unknown; signature?: unknown }) {
  const network = claimNetwork();
  const mint = parseMint(body.mint);
  if (!verified || verified.mint !== mint) throw new LinkApiError(401, 'Verify that you own this link first');
  if (keyLimited(`claim-submit:${verified.platform}:${verified.accountId}`, 5, 60 * 60_000)) throw new LinkApiError(429, 'Too many claim attempts for this account. Try again in an hour.');
  const action = body.action === 'disown' ? 'disown' : body.action === 'claim' ? 'claim' : null;
  if (!action) throw new LinkApiError(400, 'Choose Claim or Disown');
  const destination = validDestination(body.destination);

  const link = await linkForClaim(network, mint);
  if (link.canonical_id !== verified.canonicalId) throw new LinkApiError(401, 'Verify that you own this link first');
  if (link.status !== 'hatched') throw new LinkApiError(409, link.status === 'disowned' ? 'This coin was already disowned by its owner' : 'This coin was already claimed');
  const { vault } = linkKeys();
  if (destination.equals(vault)) throw new LinkApiError(400, 'That is the Hatch vault. Use your own wallet.');

  // The gap: refuse BEFORE recording anything (a proposal made now could not execute until migration).
  const { phase, state: held } = await poolOnChain(link.pool!);
  if (phase === 'gap') throw new LinkApiError(409, new GapError().message);
  if (!meetsMinClaim(held.creatorQuoteFee.toString(), minClaimSol())) throw new LinkApiError(409, minClaimMessage(minClaimSol()));

  // The destination wallet signed the one-time message for exactly this coin, account and wallet.
  const nonceId = String(body.nonce ?? '');
  const issued = await getNonce(nonceId);
  if (!issued || issued.network !== network || issued.mint !== mint || issued.account_id !== verified.accountId || issued.wallet !== destination.toBase58())
    throw new LinkApiError(400, 'Sign the claim message with the destination wallet first');
  if (!walletSigned(issued.message, body.signature, destination)) throw new LinkApiError(400, 'The signature is not from the destination wallet');
  if (!(await consumeNonce({ nonce: nonceId, network, mint, accountId: verified.accountId, wallet: destination.toBase58() })))
    throw new LinkApiError(400, 'That signature request expired or was already used. Sign again.');
  const signature = String(body.signature);

  let claim: ClaimRow;
  try {
    claim = await insertClaim({
      network,
      canonical_id: link.canonical_id,
      mint,
      platform: verified.platform,
      action,
      account_id: verified.accountId,
      account_login: verified.login,
      verified_at: verified.verifiedAt,
      destination: destination.toBase58(),
      destination_message: issued.message,
      destination_signature: signature,
      nonce: nonceId,
      trust: (verified.trust ?? null) as OwnerTrust | null,
      evidence_url: verified.evidence ?? null,
    });
  } catch (e) {
    if (e instanceof ClaimOpenError) throw new LinkApiError(409, 'A claim for this coin is already waiting for approval. To change the wallet, it has to be rejected first.');
    throw e;
  }
  const log = { network, claim_id: claim.id, canonical_id: link.canonical_id, platform: verified.platform, account_id: verified.accountId, account_login: verified.login, destination: claim.destination };
  await appendClaimLog({ ...log, event: 'submitted', detail: { action, mint, destinationMessage: issued.message, destinationSignature: signature, nonce: nonceId, trust: verified.trust ?? null, evidence: verified.evidence ?? null } });

  const v = vaultEnv();
  try {
    const p = await proposeHandover(connection(), v, { pool: new PublicKey(link.pool!), destination, memo: `hatch ${action} ${link.canonical_id}` });
    // Large claims wait: the handover can only execute 48 h after the proposal (disputes can come in meanwhile).
    const lock = needsTimelock(p.heldLamports, claimTimelockSol()) ? timelockUntil(Date.now()) : null;
    const updated = await updateClaim(claim.id, { status: 'proposed', squads_proposal: p.proposal.toBase58(), transaction_index: Number(p.transactionIndex), held_lamports: Number(p.heldLamports), propose_signatures: p.signatures, timelock_until: lock }, ['pending']);
    await appendClaimLog({ ...log, event: 'proposed', proposal: p.proposal.toBase58(), signatures: p.signatures, detail: { transactionIndex: Number(p.transactionIndex), heldLamports: p.heldLamports.toString(), phase: p.phase, timelockUntil: lock } });
    forgetSwr(`links:mint:${network}:${mint}`);
    return { claim: publicClaim(updated ?? claim) };
  } catch (e) {
    const msg = e instanceof GapError ? e.message : 'Could not create the approval request. Try again in a few minutes.';
    await updateClaim(claim.id, { status: 'failed', error: e instanceof Error ? e.message.slice(0, 300) : 'unknown' }, ['pending']);
    await appendClaimLog({ ...log, event: 'propose-failed', detail: { error: e instanceof Error ? e.message.slice(0, 300) : 'unknown' } });
    throw new LinkApiError(e instanceof GapError ? 409 : 502, msg);
  }
}

// ---------- disputes ----------

/** Anyone can dispute an open claim (contact + reason). Shown to the approver; it does not stop the claim by itself. */
export async function disputeClaim(body: { mint?: unknown; contact?: unknown; reason?: unknown }) {
  const network = claimNetwork();
  const mint = parseMint(body.mint);
  const v = validateDispute(body);
  if ('error' in v) throw new LinkApiError(400, v.error);
  const link = await linkForClaim(network, mint);
  const open = (await claimsForLink(network, link.canonical_id)).find((c) => OPEN.includes(c.status));
  if (!open) throw new LinkApiError(404, 'There is no open claim for this coin');
  const d = await insertDispute({ network, claim_id: open.id, canonical_id: link.canonical_id, contact: v.contact, reason: v.reason });
  await appendClaimLog({ network, claim_id: open.id, canonical_id: link.canonical_id, event: 'disputed', destination: open.destination, detail: { disputeId: d.id } });
  forgetSwr(`links:mint:${network}:${mint}`);
  return { ok: true };
}

// ---------- admin (the approver's wallet) ----------

export { ADMIN_MESSAGE };

/** The connected wallet must be the approver; it signs ADMIN_MESSAGE(ts) with ts within 10 minutes. */
export function assertAdmin(headers: { wallet?: unknown; ts?: unknown; sig?: unknown }, now = Date.now()): PublicKey {
  const v = vaultEnv();
  let wallet: PublicKey;
  try {
    wallet = new PublicKey(String(headers.wallet ?? ''));
  } catch {
    throw new LinkApiError(401, 'Connect the approver wallet');
  }
  if (!wallet.equals(v.approver)) throw new LinkApiError(403, 'This page is only for the Hatch approver wallet');
  const ts = Number(headers.ts);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 10 * 60_000) throw new LinkApiError(401, 'Sign in again');
  let sig: Uint8Array;
  try {
    sig = bs58.decode(String(headers.sig ?? ''));
  } catch {
    throw new LinkApiError(401, 'Sign in again');
  }
  const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, wallet.toBuffer()]), format: 'der', type: 'spki' });
  if (sig.length !== 64 || !edVerify(null, Buffer.from(ADMIN_MESSAGE(ts)), key, Buffer.from(sig))) throw new LinkApiError(401, 'Sign in again');
  return wallet;
}

export async function adminClaims() {
  const network = claimNetwork();
  const v = vaultEnv();
  const conn = connection();
  const rows = await claimsByStatus(network, ['pending', 'proposed', 'approved', 'executed', 'rejected', 'failed'], 50);
  const disputes = await disputesFor(rows.map((r) => r.id));
  const timelockSol = claimTimelockSol();
  return Promise.all(
    rows.map(async (c) => {
      const link = await getLink(network, c.canonical_id);
      const live = link?.pool && OPEN.includes(c.status) ? await poolOnChain(link.pool).catch((): null => null) : null;
      const ps = c.transaction_index != null && OPEN.includes(c.status) ? await proposalState(conn, v, BigInt(c.transaction_index)).catch((): null => null) : null;
      return {
        id: c.id,
        status: c.status,
        action: c.action,
        mint: c.mint,
        link: link ? { displayUrl: link.display_url, title: link.title, coinName: link.coin_name, ticker: link.coin_ticker, ownerHandle: link.owner_handle } : null,
        verified: { platform: c.platform, accountId: c.account_id, login: c.account_login, at: c.verified_at },
        destination: c.destination,
        proposal: c.squads_proposal,
        transactionIndex: c.transaction_index,
        proposalState: ps?.state ?? null,
        heldLamports: live ? live.state.creatorQuoteFee.toString() : c.held_lamports != null ? String(c.held_lamports) : null,
        receivedLamports: c.received_lamports != null ? String(c.received_lamports) : null,
        executeSignature: c.execute_signature,
        error: c.error,
        createdAt: c.created_at,
        trust: c.trust,
        destinationSigned: !!c.destination_signature,
        evidenceUrl: c.evidence_url,
        timelockUntil: c.timelock_until,
        timelockSol,
        disputes: disputes.filter((d) => d.claim_id === c.id).map((d) => ({ contact: d.contact, reason: d.reason, at: d.created_at })),
      };
    })
  );
}

/** An UNSIGNED vote transaction for the approver's wallet (fee payer = the approver). The server never signs it. */
export async function adminVoteTx(approver: PublicKey, body: { claimId?: unknown; vote?: unknown }) {
  claimNetwork();
  const c = await getClaim(String(body.claimId ?? ''));
  if (!c || c.transaction_index == null || !['proposed', 'approved'].includes(c.status)) throw new LinkApiError(404, 'No claim waiting for a vote');
  const v = vaultEnv();
  const index = BigInt(c.transaction_index);
  if (body.vote === 'cancel' && c.status !== 'approved') throw new LinkApiError(409, 'Only an approved claim can be cancelled');
  const ix = body.vote === 'reject' ? rejectInstruction(v, approver, index) : body.vote === 'cancel' ? cancelInstruction(v, approver, index) : approveInstruction(v, approver, index);
  const tx = new Transaction().add(ix);
  addPriorityFee(tx, 100_000);
  const bh = await connection().getLatestBlockhash('confirmed');
  tx.feePayer = approver;
  tx.recentBlockhash = bh.blockhash;
  return { transaction: tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString('base64'), lastValidBlockHeight: bh.lastValidBlockHeight };
}

/**
 * After a vote: reads the proposal. Approved -> the server executes it, verifies the new creator on chain, and
 * marks everything done. Rejected -> the claim is closed (the link is free for a new claim).
 */
export async function syncClaim(claimIdRaw: unknown, voteSignature?: unknown) {
  const network = claimNetwork();
  const c = await getClaim(String(claimIdRaw ?? ''));
  if (!c) throw new LinkApiError(404, 'No such claim');
  if (!OPEN.includes(c.status) || c.transaction_index == null) return { status: c.status };
  const v = vaultEnv();
  const conn = connection();
  const index = BigInt(c.transaction_index);
  const log = { network, claim_id: c.id, canonical_id: c.canonical_id, platform: c.platform, account_id: c.account_id, account_login: c.account_login, destination: c.destination, proposal: c.squads_proposal };
  const sig = typeof voteSignature === 'string' && /^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(voteSignature) ? voteSignature : null;
  const ps = await proposalState(conn, v, index);

  if (ps.state === 'Rejected' || ps.state === 'Cancelled') {
    const done = await updateClaim(c.id, { status: 'rejected', approve_signature: sig ?? c.approve_signature }, OPEN);
    if (done) await appendClaimLog({ ...log, event: 'rejected', signatures: sig ? [sig] : [], detail: { by: ps.rejected } });
    return { status: 'rejected' as const };
  }
  if (ps.state !== 'Approved' && ps.state !== 'Executed') return { status: c.status, proposalState: ps.state as ProposalState };
  if (ps.approved.includes(v.server.publicKey.toBase58())) throw new Error('the server key voted: refusing'); // cannot happen (no Vote permission)

  if (c.status !== 'approved') {
    await updateClaim(c.id, { status: 'approved', approve_signature: sig ?? c.approve_signature }, ['proposed']);
    await appendClaimLog({ ...log, event: 'approved', signatures: sig ? [sig] : [], detail: { by: ps.approved } });
  }
  const link = await getLink(network, c.canonical_id);
  if (!link?.pool || !link.mint) throw new LinkApiError(404, 'Link not found');
  // The timelock: approved, but large claims execute only once 48 h have passed since the proposal.
  const wait = timelockRemainingMs(c.timelock_until);
  if (ps.state === 'Approved' && wait > 0) return { status: 'approved' as const, executesAt: c.timelock_until, waitMs: wait };

  let executeSig = c.execute_signature;
  if (ps.state === 'Approved') {
    try {
      executeSig = await executeHandover(conn, v, index);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await appendClaimLog({ ...log, event: 'execute-failed', detail: { error: msg.slice(0, 300) } });
      if (/6022|NotPermitToDoThisAction/i.test(msg)) throw new LinkApiError(409, new GapError().message);
      throw new LinkApiError(502, 'Approved, but running it failed. Try again in a minute.');
    }
  }
  // Verify on chain: the destination is now the pool creator.
  const { state } = await poolOnChain(link.pool);
  if (state.creator.toBase58() !== c.destination) {
    await appendClaimLog({ ...log, event: 'verify-failed', signatures: executeSig ? [executeSig] : [], detail: { creator: state.creator.toBase58() } });
    throw new LinkApiError(502, 'The handover did not take effect on chain');
  }
  const received = executeSig ? await receivedBy(conn, executeSig, c.destination) : null;
  await updateClaim(c.id, { status: 'executed', execute_signature: executeSig, executed_at: new Date().toISOString(), received_lamports: received }, ['approved', 'proposed']);
  await markLinkHandedOver(network, c.canonical_id, link.mint, c.action === 'disown' ? 'disowned' : 'claimed', c.destination, c.account_id);
  await appendClaimLog({ ...log, event: c.action === 'disown' ? 'disowned' : 'claimed', signatures: executeSig ? [executeSig] : [], detail: { receivedLamports: received, creatorAfter: state.creator.toBase58() } });
  forgetSwr(`links:mint:${network}:${link.mint}`);
  forgetSwr(`links:listed:${network}`);
  return { status: 'executed' as const, executeSignature: executeSig, receivedLamports: received };
}

/** SOL the destination received in a transaction (post - pre balance), from the transaction's metadata. */
async function receivedBy(conn: Connection, signature: string, wallet: string): Promise<number | null> {
  const tx = await conn.getTransaction(signature, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 }).catch((): null => null);
  if (!tx?.meta) return null;
  const keys = tx.transaction.message.getAccountKeys({ accountKeysFromLookups: tx.meta.loadedAddresses }).keySegments().flat().map((k) => k.toBase58());
  const i = keys.indexOf(wallet);
  return i < 0 ? null : tx.meta.postBalances[i]! - tx.meta.preBalances[i]!;
}

// ---------- unclaimed + scouts ----------

export { OPEN as OPEN_CLAIM_STATUSES };

/** /unclaimed: link coins not claimed yet with creator fees waiting in the pool, most held first. */
export async function unclaimedCoins() {
  claimNetwork();
  const { listedLinkPools } = await import('./service');
  const pools = await listedLinkPools();
  const network = claimNetwork();
  const out = [];
  for (const p of pools) {
    const link = await getLinkByMint(network, p.baseMint);
    if (!link || link.status !== 'hatched' || !p.link) continue;
    const held = p.fees.creatorQuote;
    if (held.lte(0)) continue;
    out.push({ mint: p.baseMint, title: p.link.title, platform: p.link.platform, ownerHandle: p.link.ownerHandle, displayUrl: p.link.displayUrl, coinName: link.coin_name, ticker: link.coin_ticker, heldSol: held.toString() });
  }
  return out.sort((a, b) => Number(b.heldSol) - Number(a.heldSol));
}

/** /scouts: wallets that hatched link coins (credit only, no fee share): coins hatched and coins graduated. */
export async function scouts() {
  const network = claimNetwork();
  const { listedLinkPools } = await import('./service');
  const { hatchersOfLiveLinks } = await import('./store');
  const [rows, pools] = await Promise.all([hatchersOfLiveLinks(network), listedLinkPools()]);
  const graduated = new Set(pools.filter((p) => p.isMigrated).map((p) => p.baseMint));
  const by = new Map<string, { wallet: string; hatched: number; graduated: number }>();
  for (const r of rows) {
    const s = by.get(r.hatched_by!) ?? { wallet: r.hatched_by!, hatched: 0, graduated: 0 };
    s.hatched++;
    if (r.mint && graduated.has(r.mint)) s.graduated++;
    by.set(r.hatched_by!, s);
  }
  return [...by.values()].sort((a, b) => b.graduated - a.graduated || b.hatched - a.hatched).slice(0, 100);
}
