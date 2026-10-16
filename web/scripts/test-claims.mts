// Link coin claims (P4a): owner rule, gap, destinations, signed cookies, admin sign-in, server permissions, cap.
// Pure / offline. The on-chain flow is proven by scripts/link-claim-e2e-devnet.mts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign as edSign } from 'node:crypto';
import BN from 'bn.js';
import bs58 from 'bs58';
import { Keypair, PublicKey } from '@solana/web3.js';
import * as multisig from '@sqds/multisig';
import { githubOwnsRepo, OWNER_REFUSAL } from '../src/lib/links/ownerRule.ts';
import { ADMIN_MESSAGE } from '../src/lib/links/claimShared.ts';

// Env for the server modules (throwaway values; nothing here touches a network).
process.env.LINK_CLAIM_SECRET = 'x'.repeat(64);
const server = Keypair.generate();
const { publicKey: approverPub, privateKey: approverPriv } = generateKeyPairSync('ed25519');
const approverRaw = approverPub.export({ format: 'der', type: 'spki' }).subarray(-32);
const approver = new PublicKey(approverRaw);
const multisigPda = Keypair.generate().publicKey;
process.env.LINK_SQUADS_MULTISIG = multisigPda.toBase58();
process.env.LINK_APPROVER = approver.toBase58();
process.env.LINK_SQUADS_SERVER_KEY = JSON.stringify(Array.from(server.secretKey));

const { poolPhase, GapError, vaultEnv, approveInstruction } = await import('../src/lib/server/links/squads.ts');
const { sign, verify } = await import('../src/lib/server/links/claimCookie.ts');
const { validDestination, assertAdmin } = await import('../src/lib/server/links/claims.ts');
const { authorizeUrl, newPkce, GITHUB_SCOPE } = await import('../src/lib/server/links/github.ts');
const { LINK_MAX_FIRST_BUY_SOL } = await import('../src/lib/server/links/chain.ts');

test('owner rule: the repo belongs to the signed-in user (by numeric id) or an org where they are an active admin', () => {
  const user = { id: 42 };
  assert.deepEqual(githubOwnsRepo({ user, repoOwner: { id: 42, type: 'User' } }), { ok: true, via: 'user' });
  // Same login text means nothing: ids only. Another user's repo is refused.
  assert.deepEqual(githubOwnsRepo({ user, repoOwner: { id: 43, type: 'User' } }), { ok: false, reason: 'not-owner' });
  const org = { id: 900, type: 'Organization' };
  assert.deepEqual(githubOwnsRepo({ user, repoOwner: org, membership: { role: 'admin', state: 'active', organization: { id: 900 } } }), { ok: true, via: 'org-admin' });
  assert.deepEqual(githubOwnsRepo({ user, repoOwner: org, membership: { role: 'member', state: 'active', organization: { id: 900 } } }), { ok: false, reason: 'org-not-admin' });
  assert.deepEqual(githubOwnsRepo({ user, repoOwner: org, membership: { role: 'admin', state: 'pending', organization: { id: 900 } } }), { ok: false, reason: 'org-not-admin' });
  assert.deepEqual(githubOwnsRepo({ user, repoOwner: org, membership: null }), { ok: false, reason: 'not-owner' });
  // A membership for a different org (e.g. the org was renamed and another took the name) does not count.
  assert.deepEqual(githubOwnsRepo({ user, repoOwner: org, membership: { role: 'admin', state: 'active', organization: { id: 901 } } }), { ok: false, reason: 'not-owner' });
  assert.equal(OWNER_REFUSAL['not-owner'], "This GitHub account doesn't own this repo");
});

test('GitHub sign-in: state + PKCE S256, minimal scope', () => {
  const p = newPkce();
  assert.match(p.verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(p.challenge, p.verifier);
  const u = new URL(authorizeUrl({ clientId: 'cid', redirectUri: 'http://localhost:3200/api/links/claim/github/callback', state: p.state, challenge: p.challenge }));
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('state'), p.state);
  assert.equal(u.searchParams.get('scope'), 'read:org');
  assert.equal(GITHUB_SCOPE, 'read:org');
});

test('the curve-complete gap (not migrated yet) is refused; curve and migrated pools are not', () => {
  const t = new BN(10_000_000_000);
  assert.equal(poolPhase({ isMigrated: 0, quoteReserve: new BN(5) }, t), 'curve');
  assert.equal(poolPhase({ isMigrated: 0, quoteReserve: t }, t), 'gap');
  assert.equal(poolPhase({ isMigrated: 0, quoteReserve: t.addn(1) }, t), 'gap');
  assert.equal(poolPhase({ isMigrated: 1, quoteReserve: t }, t), 'migrated');
  assert.equal(new GapError().message, 'This coin is moving to its new pool, try again in a few minutes');
});

test('destinations must be real wallets (valid, on curve, not a program address)', () => {
  const w = Keypair.generate().publicKey;
  assert.equal(validDestination(w.toBase58()).toBase58(), w.toBase58());
  assert.equal(validDestination(`  ${w.toBase58()} `).toBase58(), w.toBase58());
  const [pda] = multisig.getVaultPda({ multisigPda, index: 0 });
  assert.throws(() => validDestination(pda.toBase58()), /not a wallet/);
  for (const bad of ['', 'hello', '0x1234', w.toBase58().slice(0, 20), '11111111111111111111111111111111']) assert.throws(() => validDestination(bad), bad);
});

test('verified-id cookie: signed, tamper-proof, expires', () => {
  const v = sign({ mint: 'M', accountId: '42', exp: Date.now() + 60_000 });
  assert.equal(verify<{ accountId: string; exp: number }>(v)?.accountId, '42');
  const [body, mac] = v.split('.');
  const forged = Buffer.from(JSON.stringify({ mint: 'M', accountId: '43', exp: Date.now() + 60_000 })).toString('base64url');
  assert.equal(verify(`${forged}.${mac}`), null);
  assert.equal(verify(`${body}.${mac!.slice(0, -2)}xx`), null);
  assert.equal(verify(sign({ exp: Date.now() - 1 })), null);
  assert.equal(verify(undefined), null);
});

test('admin: only the approver wallet, with a fresh signature of the admin message', () => {
  const ts = Date.now();
  const sig = bs58.encode(edSign(null, Buffer.from(ADMIN_MESSAGE(ts)), approverPriv));
  assert.equal(assertAdmin({ wallet: approver.toBase58(), ts, sig }).toBase58(), approver.toBase58());
  assert.throws(() => assertAdmin({ wallet: Keypair.generate().publicKey.toBase58(), ts, sig }), /only for the Hatch approver/);
  assert.throws(() => assertAdmin({ wallet: approver.toBase58(), ts: ts + 1, sig }), /Sign in again/); // signed another message
  assert.throws(() => assertAdmin({ wallet: approver.toBase58(), ts: ts - 11 * 60_000, sig: bs58.encode(edSign(null, Buffer.from(ADMIN_MESSAGE(ts - 11 * 60_000)), approverPriv)) }), /Sign in again/);
  assert.throws(() => assertAdmin({ wallet: server.publicKey.toBase58(), ts, sig }), /only for the Hatch approver/); // the server key is never an admin
});

test('the server key never votes: votes are built for the approver wallet to sign, never the server', () => {
  const v = vaultEnv();
  assert.equal(v.server.publicKey.toBase58(), server.publicKey.toBase58());
  const ix = approveInstruction(v, approver, 7n);
  const signers = ix.keys.filter((k) => k.isSigner).map((k) => k.pubkey.toBase58());
  assert.deepEqual(signers, [approver.toBase58()]);
  assert.ok(!signers.includes(server.publicKey.toBase58()));
});

test('first buy cap is 0.5 SOL', () => {
  assert.equal(LINK_MAX_FIRST_BUY_SOL, 0.5);
});

// ---------- P4a.1: claim hardening ----------
const { destinationMessage, trustFlags, trustLabel, TRUST_LABEL, needsTimelock, timelockRemainingMs, timelockUntil, validateDispute, CLAIM_TIMELOCK_HOURS } = await import('../src/lib/links/claimRules.ts');
const { walletSigned, claimTimelockSol } = await import('../src/lib/server/links/claims.ts');
const { renamedSinceHatch } = await import('../src/lib/server/links/github.ts');
const { createPrivateKey } = await import('node:crypto');

/** Signs like a wallet's signMessage (ed25519 over the UTF-8 bytes), from a web3.js Keypair. */
const walletSign = (kp: Keypair, message: string) =>
  bs58.encode(edSign(null, Buffer.from(message, 'utf8'), createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(kp.secretKey.subarray(0, 32))]), format: 'der', type: 'pkcs8' })));

test('destination signature: exact message, only the destination wallet, only for this mint', () => {
  const dest = Keypair.generate();
  const other = Keypair.generate();
  const base = { ticker: 'HELLO', mint: 'MintAAA', platform: 'GitHub', login: 'octocat', accountId: '583231', wallet: dest.publicKey.toBase58(), nonce: 'n1', date: '2026-10-16' };
  const msg = destinationMessage(base);
  assert.equal(msg, `Hatch claim: $HELLO MintAAA for GitHub account octocat (583231) to ${dest.publicKey.toBase58()}, nonce n1, 2026-10-16`);
  const sig = walletSign(dest, msg);
  assert.equal(walletSigned(msg, sig, dest.publicKey), true);
  // Signed by another wallet (a typo'd or wrong destination) -> refused.
  assert.equal(walletSigned(msg, walletSign(other, msg), dest.publicKey), false);
  // The same signature for another mint (or another nonce) -> refused: the server rebuilds the message it issued.
  assert.equal(walletSigned(destinationMessage({ ...base, mint: 'MintBBB' }), sig, dest.publicKey), false);
  assert.equal(walletSigned(destinationMessage({ ...base, nonce: 'n2' }), sig, dest.publicKey), false);
  for (const bad of ['', 'xyz', bs58.encode(Buffer.alloc(64))]) assert.equal(walletSigned(msg, bad, dest.publicKey), false);
});

test('trust labels: new (< 30 days) or tiny audience -> amber label; established accounts get none; never "verified by Hatch"', () => {
  const now = Date.parse('2026-10-16T00:00:00Z');
  const t = (o: Record<string, unknown>) => ({ platform: 'github' as const, accountCreatedAt: '2015-01-01T00:00:00Z', followers: 120, stars: 45, platformVerified: null, renamedOrTransferred: false, checkedAt: '2026-10-16T00:00:00Z', ...o });
  assert.equal(trustLabel(t({}), now), null);
  assert.equal(trustLabel(t({ accountCreatedAt: '2026-10-01T00:00:00Z' }), now), TRUST_LABEL);
  assert.equal(trustLabel(t({ followers: 2, stars: 3 }), now), TRUST_LABEL);
  assert.equal(trustLabel(t({ followers: 2, stars: 300 }), now), null); // a big repo is an audience
  assert.equal(trustLabel(t({ accountCreatedAt: null }), now), TRUST_LABEL); // unknown age: treat as new
  assert.deepEqual(trustFlags(t({ renamedOrTransferred: true }), now)?.risky, true);
  assert.equal(TRUST_LABEL, 'New or small account, check the source');
  assert.doesNotMatch(TRUST_LABEL, /verified/i);
  // Renamed / transferred: name or owner id differs from the hatched link.
  assert.equal(renamedSinceHatch({ canonicalId: 'gh:repo:octocat/hello-world', hatchedOwnerId: '583231', fullName: 'octocat/Hello-World', ownerId: 583231 }), false);
  assert.equal(renamedSinceHatch({ canonicalId: 'gh:repo:octocat/hello-world', hatchedOwnerId: '583231', fullName: 'octocat/hello-world-2', ownerId: 583231 }), true);
  assert.equal(renamedSinceHatch({ canonicalId: 'gh:repo:octocat/hello-world', hatchedOwnerId: '583231', fullName: 'octocat/hello-world', ownerId: 999 }), true);
});

test('timelock: claims holding >= CLAIM_TIMELOCK_SOL (default 0.5) execute only 48 h after the proposal', () => {
  const saved = process.env.CLAIM_TIMELOCK_SOL;
  try {
    delete process.env.CLAIM_TIMELOCK_SOL;
    assert.equal(claimTimelockSol(), 0.5);
    process.env.CLAIM_TIMELOCK_SOL = '2';
    assert.equal(claimTimelockSol(), 2);
    process.env.CLAIM_TIMELOCK_SOL = 'abc';
    assert.equal(claimTimelockSol(), 0.5);
  } finally {
    if (saved === undefined) delete process.env.CLAIM_TIMELOCK_SOL;
    else process.env.CLAIM_TIMELOCK_SOL = saved;
  }
  assert.equal(needsTimelock(499_999_999n, 0.5), false);
  assert.equal(needsTimelock(500_000_000n, 0.5), true);
  const proposed = Date.parse('2026-10-16T00:00:00Z');
  const until = timelockUntil(proposed);
  assert.equal(until, '2026-10-18T00:00:00.000Z');
  assert.equal(CLAIM_TIMELOCK_HOURS, 48);
  assert.equal(timelockRemainingMs(until, proposed + 47 * 3_600_000), 3_600_000);
  assert.equal(timelockRemainingMs(until, proposed + 48 * 3_600_000), 0);
  assert.equal(timelockRemainingMs(null, proposed), 0); // under the threshold: no wait
});

test('disputes: contact and reason are required and bounded', () => {
  assert.deepEqual(validateDispute({ contact: ' me@x.com ', reason: 'This repo belongs to my org, not them.' }), { contact: 'me@x.com', reason: 'This repo belongs to my org, not them.' });
  assert.ok('error' in validateDispute({ contact: 'a', reason: 'long enough reason here' }));
  assert.ok('error' in validateDispute({ contact: 'me@x.com', reason: 'short' }));
  assert.ok('error' in validateDispute({ contact: 'me@x.com', reason: 'x'.repeat(2001) }));
});
