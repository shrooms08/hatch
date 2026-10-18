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
  assert.equal(verify(`${body}.${mac![0] === 'A' ? 'B' : 'A'}${mac!.slice(1)}`), null);
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

// ---------- P4b: YouTube claims ----------
const { youtubeOwnsVideo, YOUTUBE_REFUSAL } = await import('../src/lib/links/ownerRule.ts');
const { verifyYoutubeOwner, googleAuthorizeUrl, YOUTUBE_SCOPE, channelTrust } = await import('../src/lib/server/links/youtube.ts');
const { trustSummary: ytSummary } = await import('../src/lib/links/claimRules.ts');

process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-secret';
process.env.YOUTUBE_API_KEY = 'test-key';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
/** A fake fetch for videos.list / token / channels.list, recording which URLs were called (never a real network). */
function googleFake(o: { video?: Response | (() => never); token?: Response; channels?: Response }) {
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(url.split('?')[0]!);
    if (url.includes('/youtube/v3/videos')) return typeof o.video === 'function' ? o.video() : o.video ?? json(200, { items: [{ snippet: { channelId: 'UC_video_channel' } }] });
    if (url.includes('oauth2.googleapis.com/token')) return o.token ?? json(200, { access_token: 'tok' });
    if (url.includes('/youtube/v3/channels')) return o.channels ?? json(200, { items: [] });
    throw new Error(`unexpected ${url}`);
  }) as unknown as typeof fetch;
  return { f, calls };
}
const ch = (id: string, extra: Record<string, unknown> = {}) => ({ id, snippet: { title: `Channel ${id}`, customUrl: `@${id.toLowerCase()}`, publishedAt: '2014-03-01T00:00:00Z' }, statistics: { subscriberCount: '52000', hiddenSubscriberCount: false }, ...extra });
const ytArgs = { code: 'c', verifier: 'v', redirectUri: 'http://localhost:3200/api/links/claim/youtube/callback', videoId: 'jNQXAC9IVRw' };

test('YouTube owner rule: any of the managed channels may match; another channel is refused', () => {
  assert.deepEqual(youtubeOwnsVideo({ videoChannelId: 'UC_b', myChannels: [{ id: 'UC_a' }, { id: 'UC_b' }] }), { ok: true, channelId: 'UC_b' });
  assert.deepEqual(youtubeOwnsVideo({ videoChannelId: 'UC_c', myChannels: [{ id: 'UC_a' }, { id: 'UC_b' }] }), { ok: false, reason: 'not-owner' });
  assert.deepEqual(youtubeOwnsVideo({ videoChannelId: 'UC_a', myChannels: [] }), { ok: false, reason: 'no-channel' });
});

test('YouTube sign-in: state + PKCE S256, youtube.readonly only, account chooser for Brand Accounts, no refresh token', () => {
  const u = new URL(googleAuthorizeUrl({ clientId: 'cid', redirectUri: ytArgs.redirectUri, state: 's', challenge: 'ch' }));
  assert.equal(u.searchParams.get('scope'), 'https://www.googleapis.com/auth/youtube.readonly');
  assert.equal(YOUTUBE_SCOPE, 'https://www.googleapis.com/auth/youtube.readonly');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('access_type'), 'online');
  assert.equal(u.searchParams.get('prompt'), 'select_account');
});

test('YouTube verify: owner among several managed channels -> identity is the channel id, with trust signals', async () => {
  const g = googleFake({ channels: json(200, { items: [ch('UC_other'), ch('UC_video_channel')] }) });
  const who = await verifyYoutubeOwner(ytArgs, g.f);
  assert.equal(who.accountId, 'UC_video_channel');
  assert.equal(who.login, '@uc_video_channel');
  assert.equal(who.trust.platform, 'youtube');
  assert.equal(who.trust.followers, 52000);
  assert.equal(trustLabel(who.trust), null);
  assert.deepEqual(g.calls, ['https://www.googleapis.com/youtube/v3/videos', 'https://oauth2.googleapis.com/token', 'https://www.googleapis.com/youtube/v3/channels']);
});

test('YouTube verify: wrong channel and no channel are refused', async () => {
  await assert.rejects(() => verifyYoutubeOwner(ytArgs, googleFake({ channels: json(200, { items: [ch('UC_someone_else')] }) }).f), { message: YOUTUBE_REFUSAL['not-owner'] });
  await assert.rejects(() => verifyYoutubeOwner(ytArgs, googleFake({ channels: json(200, { items: [] }) }).f), { message: YOUTUBE_REFUSAL['no-channel'] });
});

test("YouTube verify: a private or deleted video is refused before the sign-in is used", async () => {
  const g = googleFake({ video: json(200, { items: [] }) });
  await assert.rejects(() => verifyYoutubeOwner(ytArgs, g.f), { message: "This video isn't public anymore, so it can't be verified right now" });
  assert.deepEqual(g.calls, ['https://www.googleapis.com/youtube/v3/videos']); // no token exchange, no channels.list
});

test('YouTube verify: quota, key, outage, network and token failures give clear messages', async () => {
  const quota = json(403, { error: { errors: [{ reason: 'quotaExceeded' }] } });
  await assert.rejects(() => verifyYoutubeOwner(ytArgs, googleFake({ video: quota }).f), /API limit is used up/);
  await assert.rejects(() => verifyYoutubeOwner(ytArgs, googleFake({ channels: json(403, { error: { errors: [{ reason: 'quotaExceeded' }] } }) }).f), /API limit is used up/);
  await assert.rejects(() => verifyYoutubeOwner(ytArgs, googleFake({ video: json(400, { error: { errors: [{ reason: 'keyInvalid' }] } }) }).f), /not set up correctly/);
  await assert.rejects(() => verifyYoutubeOwner(ytArgs, googleFake({ channels: json(500, {}) }).f), /not answering/);
  await assert.rejects(() => verifyYoutubeOwner(ytArgs, googleFake({ video: () => { throw new TypeError('fetch failed'); } }).f), /not answering/);
  await assert.rejects(() => verifyYoutubeOwner(ytArgs, googleFake({ token: json(400, { error: 'invalid_grant' }) }).f), /did not complete/);
});

test('YouTube trust: hidden subscriber counts say "hidden" and get the amber label', () => {
  const hidden = channelTrust(ch('UC_x', { statistics: { hiddenSubscriberCount: true } }) as never);
  assert.equal(hidden.followers, null);
  assert.equal(hidden.followersHidden, true);
  assert.equal(trustLabel(hidden), TRUST_LABEL);
  assert.match(ytSummary(hidden)!, /subscribers hidden/);
  const tiny = channelTrust(ch('UC_y', { statistics: { subscriberCount: '3', hiddenSubscriberCount: false } }) as never);
  assert.equal(trustLabel(tiny), TRUST_LABEL);
  assert.match(ytSummary(channelTrust(ch('UC_z') as never))!, /^channel \d+ years old · 52000 subscribers$/);
});

// ---------- P4c: X post-a-code + minimum claim ----------
const { xCodeFrom, isXCode, snowflakeMs, snowflakeAt, xOwnerCheck, X_REFUSAL, X_DETAILS_UNAVAILABLE, meetsMinClaim, minClaimMessage } = await import('../src/lib/links/claimRules.ts');
const { handleOf, textOf } = await import('../src/lib/server/links/x.ts');
const { minClaimSol } = await import('../src/lib/server/links/claims.ts');

test('X code: "hatch-XXXX-XX", unambiguous characters, random', () => {
  const c = xCodeFrom(new Uint8Array([0, 1, 2, 3, 4, 5]));
  assert.equal(c, 'hatch-ABCD-EF');
  assert.ok(isXCode(c));
  assert.ok(isXCode(xCodeFrom(new Uint8Array([255, 200, 150, 99, 33, 7]))));
  for (const bad of ['hatch-ABCD-E', 'hatch-abcd-ef', 'HATCH-ABCD-EF', 'hatch-AB0D-EF', 'x']) assert.equal(isXCode(bad), false, bad);
});

test('X snowflake: the post time comes from its status id', () => {
  assert.equal(snowflakeMs('20'), 1288834974657); // pre-snowflake ids read as the epoch: always "older"
  const t = Date.parse('2026-10-16T10:00:00Z');
  assert.equal(snowflakeMs(snowflakeAt(t)), t);
  assert.equal(new Date(snowflakeMs('1588478209447866368')).toISOString().slice(0, 7), '2022-11'); // a real Nov 2022 post id
});

test('X oEmbed parsing: handle from author_url (x.com or twitter.com), text from the post', () => {
  assert.equal(handleOf('https://x.com/shroomsgotsol'), 'shroomsgotsol');
  assert.equal(handleOf('https://twitter.com/Jack/'), 'Jack');
  assert.equal(handleOf('https://evil.com/jack'), null);
  assert.equal(handleOf(undefined), null);
  assert.equal(textOf('<blockquote><p lang="en" dir="ltr">verifying hatch-ABCD-EF &amp; more <a href="x">pic</a></p>&mdash; me</blockquote>'), 'verifying hatch-ABCD-EF & more  pic ');
});

test('X owner check: same handle (any case), exact code, post newer than the code', () => {
  const issued = Date.parse('2026-10-16T10:00:00Z');
  const base = { originalHandle: 'ShroomsGotSol', codeHandle: 'shroomsgotsol', codeText: 'hatch-ABCD-EF', code: 'hatch-ABCD-EF', codePostId: snowflakeAt(issued + 60_000), issuedAtMs: issued };
  assert.deepEqual(xOwnerCheck(base), { ok: true, handle: 'ShroomsGotSol' });
  assert.deepEqual(xOwnerCheck({ ...base, codeHandle: 'someone_else' }), { ok: false, reason: 'handle-mismatch' });
  assert.deepEqual(xOwnerCheck({ ...base, codeText: 'hatch-ABCD-EG' }), { ok: false, reason: 'code-missing' });
  assert.deepEqual(xOwnerCheck({ ...base, codeText: 'no code here' }), { ok: false, reason: 'code-missing' });
  assert.deepEqual(xOwnerCheck({ ...base, codePostId: snowflakeAt(issued - 10 * 60_000) }), { ok: false, reason: 'post-too-old' });
  assert.deepEqual(xOwnerCheck({ ...base, originalHandle: null }), { ok: false, reason: 'no-handle' });
  assert.match(X_REFUSAL['handle-mismatch'], /isn't from the X account that posted the original/);
});

test('X trust: no details from oEmbed, so X claims always carry the amber label', () => {
  const t = { platform: 'x' as const, accountCreatedAt: null, followers: null, stars: null, platformVerified: null, renamedOrTransferred: false, checkedAt: '' };
  assert.equal(trustLabel(t), TRUST_LABEL);
  assert.equal(ytSummary(t), X_DETAILS_UNAVAILABLE);
});

test('minimum claim: 0.02 SOL by default (MIN_CLAIM_SOL overrides); below it the claim cannot be submitted', () => {
  const saved = process.env.MIN_CLAIM_SOL;
  try {
    delete process.env.MIN_CLAIM_SOL;
    assert.equal(minClaimSol(), 0.02);
    process.env.MIN_CLAIM_SOL = '0.05';
    assert.equal(minClaimSol(), 0.05);
    process.env.MIN_CLAIM_SOL = 'x';
    assert.equal(minClaimSol(), 0.02);
  } finally {
    if (saved === undefined) delete process.env.MIN_CLAIM_SOL;
    else process.env.MIN_CLAIM_SOL = saved;
  }
  assert.equal(meetsMinClaim(19_999_999, 0.02), false);
  assert.equal(meetsMinClaim('20000000', 0.02), true);
  assert.equal(minClaimMessage(0.02), 'Fees are still building up. Claims open at 0.02 SOL held.');
});

// ---------- graduated pools + /link cancel ----------
const { positionNftTransferIx } = await import('../src/lib/server/links/squads.ts');
const { derivePositionNftAccount } = await import('@meteora-ag/cp-amm-sdk');
const { sendRefusedBeforeBroadcast } = await import('../src/lib/links/hatchCancel.ts');

test('graduated claim: the position NFT moves out of its cp-amm position-NFT account (not an associated token account)', async () => {
  const { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID } = await import('@solana/spl-token');
  const nft = Keypair.generate().publicKey;
  const vault = Keypair.generate().publicKey;
  const dest = Keypair.generate().publicKey;
  const ix = positionNftTransferIx(nft, vault, dest);
  assert.ok(ix.programId.equals(TOKEN_2022_PROGRAM_ID));
  assert.ok(ix.keys[0]!.pubkey.equals(derivePositionNftAccount(nft)));
  assert.ok(!ix.keys[0]!.pubkey.equals(getAssociatedTokenAddressSync(nft, vault, true, TOKEN_2022_PROGRAM_ID)));
  assert.ok(ix.keys[2]!.pubkey.equals(dest));
  assert.deepEqual(ix.keys.filter((k) => k.isSigner).map((k) => k.pubkey.toBase58()), [vault.toBase58()]); // only the vault signs
});

test('/link cancel: release only when the send cannot have gone out', () => {
  assert.equal(sendRefusedBeforeBroadcast(new Error('Simulation failed. Message: Transaction simulation failed: Blockhash not found')), true);
  assert.equal(sendRefusedBeforeBroadcast(new Error('failed to send transaction: 429 Too Many Requests')), true);
  assert.equal(sendRefusedBeforeBroadcast(new TypeError('Failed to fetch')), false); // ambiguous: may have gone out
  assert.equal(sendRefusedBeforeBroadcast(new Error('Request timed out')), false);
});
