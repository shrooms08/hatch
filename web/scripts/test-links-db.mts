// Link reservations against the real database (Postgres functions in supabase/migrations). Skipped when
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. Uses throwaway rows (web:race.hatch-test.dev/...) and
// deletes them afterwards. Run: pnpm test
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

try {
  process.loadEnvFile('.env.local');
} catch {
  /* no local env: the test skips */
}
const configured = !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
const { linkIdHash } = await import('../src/lib/links/canonical.ts');
const store = configured ? await import('../src/lib/server/links/store.ts') : null;
const { supabaseAdmin } = configured ? await import('../src/lib/server/supabase.ts') : { supabaseAdmin: null };

const ids: string[] = [];
after(async () => {
  if (!configured || !ids.length) return;
  await supabaseAdmin!().from('claim_disputes').delete().in('canonical_id', ids);
  await supabaseAdmin!().from('links').delete().eq('network', 'devnet').in('canonical_id', ids);
});

async function row(canonicalId: string, mint: string) {
  return {
    network: 'devnet' as const,
    canonical_id: canonicalId,
    id_hash: await linkIdHash(canonicalId),
    kind: 'web_page' as const,
    display_url: `https://${canonicalId.slice(4)}`,
    title: 'race test',
    image_url: null,
    owner_platform: 'web',
    owner_handle: 'race.hatch-test.dev',
    owner_id: null,
    coin_name: 'Race Test',
    coin_ticker: 'RACE',
    metadata_url: null,
    mint,
    pool: null,
    config: null,
    hatched_by: 'tester',
    first_buy_lamports: 0,
    github_repo_id: null as number | null,
  };
}
const fresh = () => {
  const id = `web:race.hatch-test.dev/${randomBytes(6).toString('hex')}`;
  ids.push(id);
  return id;
};
const mint = () => `mint-${randomBytes(8).toString('hex')}`;

test('reservation race: 10 hatch requests for one link at once, exactly one wins', { skip: !configured && 'Supabase not configured' }, async () => {
  const id = fresh();
  const results = await Promise.all(Array.from({ length: 10 }, async () => store!.reserveLink(await row(id, mint()), { prevMint: null })));
  const winners = results.filter(Boolean);
  assert.equal(winners.length, 1, `winners: ${winners.length}`);
  const stored = await store!.getLink('devnet', id);
  assert.equal(stored?.mint, winners[0]!.mint);
  assert.equal(stored?.status, 'reserved');
});

test('an expired reservation can be taken over (only with the right previous mint); a hatched link never', { skip: !configured && 'Supabase not configured' }, async () => {
  const id = fresh();
  const first = mint();
  assert.ok(await store!.reserveLink(await row(id, first), { prevMint: null, ttlSeconds: 1 }));
  assert.equal(await store!.reserveLink(await row(id, mint()), { prevMint: null }), null, 'still reserved: refused');
  await new Promise((r) => setTimeout(r, 1600));
  assert.equal(await store!.reserveLink(await row(id, mint()), { prevMint: 'some-other-mint' }), null, 'wrong previous mint: refused');
  const second = mint();
  const taken = await store!.reserveLink(await row(id, second), { prevMint: first });
  assert.equal(taken?.mint, second, 'expired: taken over');
  assert.ok(await store!.markHatched('devnet', id, second));
  assert.equal((await store!.getLink('devnet', id))?.status, 'hatched');
  // Hatched is final: no takeover, no matter what.
  assert.equal(await store!.reserveLink(await row(id, mint()), { prevMint: second }), null);
  assert.equal(await store!.reserveLink(await row(id, mint()), { prevMint: null }), null);
  assert.equal(await store!.markHatched('devnet', id, 'another-mint'), null, 'only the reserved mint can be marked hatched');
});

test('release: only an expired reservation, only for its mint', { skip: !configured && 'Supabase not configured' }, async () => {
  const id = fresh();
  const m = mint();
  assert.ok(await store!.reserveLink(await row(id, m), { prevMint: null, ttlSeconds: 1 }));
  assert.equal(await store!.releaseExpired('devnet', id, m), false, 'not expired yet');
  await new Promise((r) => setTimeout(r, 1600));
  assert.equal(await store!.releaseExpired('devnet', id, 'other'), false, 'other mint');
  assert.equal(await store!.releaseExpired('devnet', id, m), true);
  assert.equal(await store!.getLink('devnet', id), null);
});

test('prefix lookup returns every link sharing the 8-hex prefix (and only those)', { skip: !configured && 'Supabase not configured' }, async () => {
  const id = fresh();
  const r = await row(id, mint());
  assert.ok(await store!.reserveLink(r, { prevMint: null }));
  const hits = await store!.linksByPrefix('devnet', r.id_hash.slice(0, 8));
  assert.ok(hits.some((h) => h.canonical_id === id));
  assert.ok(hits.every((h) => h.id_hash.startsWith(r.id_hash.slice(0, 8))));
  assert.rejects(() => store!.linksByPrefix('devnet', "abc'; drop"), /bad prefix/);
});

test('GitHub rename: the old name is hatched, the new name for the same repo id is refused', { skip: !configured && 'Supabase not configured' }, async () => {
  const repoId = 900_000_000_000 + Math.floor(Math.random() * 1e9); // far outside real GitHub ids
  const oldId = `gh:repo:race-old-${randomBytes(4).toString('hex')}/repo`;
  const newId = `gh:repo:race-new-${randomBytes(4).toString('hex')}/repo`;
  ids.push(oldId, newId);
  const oldMint = mint();
  const old = await store!.reserveLink({ ...(await row(oldId, oldMint)), kind: 'github_repo' as const, github_repo_id: repoId }, { prevMint: null });
  assert.ok(old, 'old name reserved');
  assert.ok(await store!.markHatched('devnet', oldId, oldMint));
  // Same numeric id under the new name: the unique (network, github_repo_id) index refuses it.
  const attempt = store!.reserveLink({ ...(await row(newId, mint())), kind: 'github_repo' as const, github_repo_id: repoId }, { prevMint: null });
  await assert.rejects(attempt, (e: unknown) => e instanceof store!.LinkConflictError);
  assert.equal(await store!.getLink('devnet', newId), null, 'no row for the new name');
  const holder = await store!.getLinkByGithubRepoId('devnet', repoId);
  assert.equal(holder?.canonical_id, oldId);
  assert.equal(holder?.status, 'hatched');
  assert.equal(holder?.mint, oldMint, 'the 409 can point at this coin');
});

test('My Hatches: link coins are matched by the wallet that hatched them (hatched only, never another wallet)', { skip: !configured && 'Supabase not configured' }, async () => {
  const wallet = `tester-${randomBytes(6).toString('hex')}`;
  const hatchedId = fresh();
  const pendingId = fresh();
  const h = { ...(await row(hatchedId, mint())), hatched_by: wallet, pool: `pool-${randomBytes(6).toString('hex')}` };
  assert.ok(await store!.reserveLink(h, { prevMint: null }));
  assert.ok(await store!.markHatched('devnet', hatchedId, h.mint));
  assert.ok(await store!.reserveLink({ ...(await row(pendingId, mint())), hatched_by: wallet }, { prevMint: null })); // still reserved
  const mine = await store!.linksHatchedBy('devnet', wallet);
  assert.deepEqual(mine.map((r) => r.canonical_id), [hatchedId]);
  assert.equal(mine[0]!.pool, h.pool);
  assert.deepEqual(await store!.linksHatchedBy('devnet', `${wallet}-other`), []);
  assert.ok((await store!.listedLinks('devnet')).some((r) => r.canonical_id === hatchedId));
  assert.ok(!(await store!.listedLinks('devnet')).some((r) => r.canonical_id === pendingId));
});

test('claims: one open claim per link, the destination and action can never change, the claim log is append-only', { skip: !configured && 'Supabase not configured' }, async () => {
  const id = fresh();
  const r = { ...(await row(id, mint())), pool: `pool-${randomBytes(6).toString('hex')}` };
  assert.ok(await store!.reserveLink(r, { prevMint: null }));
  assert.ok(await store!.markHatched('devnet', id, r.mint));
  const base = { network: 'devnet' as const, canonical_id: id, mint: r.mint, platform: 'github', account_id: '42', account_login: 'tester', verified_at: new Date().toISOString() };
  const c = await store!.insertClaim({ ...base, action: 'claim', destination: 'DestOne1111111111111111111111111111111111111' });
  assert.equal(c.status, 'pending');
  // A second open claim for the same link is refused by the database.
  await assert.rejects(() => store!.insertClaim({ ...base, action: 'disown', destination: 'DestTwo1111111111111111111111111111111111111' }), store!.ClaimOpenError);
  // The destination (and the action) cannot be changed once set.
  const sb = supabaseAdmin!();
  const d = await sb.from('claims').update({ destination: 'DestTwo1111111111111111111111111111111111111' }).eq('id', c.id);
  assert.match(String(d.error?.message), /destination cannot be changed/);
  const a = await sb.from('claims').update({ action: 'disown' }).eq('id', c.id);
  assert.match(String(a.error?.message), /action cannot be changed/);
  // Status transitions still work; once rejected the link is free for a new claim (to change the wallet).
  assert.equal((await store!.updateClaim(c.id, { status: 'rejected' }, ['pending', 'proposed']))?.status, 'rejected');
  const again = await store!.insertClaim({ ...base, action: 'disown', destination: 'DestTwo1111111111111111111111111111111111111' });
  assert.equal(again.action, 'disown');
  await store!.updateClaim(again.id, { status: 'failed' }, ['pending']);
  // The log: insert works, update / delete are refused. (A test row stays: the log is append-only by design.)
  await store!.appendClaimLog({ network: 'devnet', claim_id: null, canonical_id: id, event: 'test', detail: { from: 'test-links-db' } });
  const logged = await sb.from('claim_log').select('id').eq('canonical_id', id).limit(1).single();
  assert.ok(logged.data?.id);
  assert.match(String((await sb.from('claim_log').update({ event: 'tampered' }).eq('id', logged.data!.id)).error?.message), /append-only/);
  assert.match(String((await sb.from('claim_log').delete().eq('id', logged.data!.id)).error?.message), /append-only/);
});

test('claim nonces: used once, only for the same mint / account / wallet, and only before they expire', { skip: !configured && 'Supabase not configured' }, async () => {
  const nonce = randomBytes(16).toString('hex');
  const n = { nonce, network: 'devnet' as const, mint: 'MintAAA', platform: 'github', account_id: '42', wallet: 'WalletA', message: 'Hatch claim: test', expires_at: new Date(Date.now() + 60_000).toISOString() };
  await store!.insertNonce(n);
  assert.equal(await store!.consumeNonce({ nonce, network: 'devnet', mint: 'MintBBB', accountId: '42', wallet: 'WalletA' }), null); // another mint
  assert.equal(await store!.consumeNonce({ nonce, network: 'devnet', mint: 'MintAAA', accountId: '43', wallet: 'WalletA' }), null); // another account
  assert.equal(await store!.consumeNonce({ nonce, network: 'devnet', mint: 'MintAAA', accountId: '42', wallet: 'WalletB' }), null); // another wallet
  assert.equal((await store!.consumeNonce({ nonce, network: 'devnet', mint: 'MintAAA', accountId: '42', wallet: 'WalletA' }))?.nonce, nonce);
  assert.equal(await store!.consumeNonce({ nonce, network: 'devnet', mint: 'MintAAA', accountId: '42', wallet: 'WalletA' }), null); // replay
  const expired = randomBytes(16).toString('hex');
  await store!.insertNonce({ ...n, nonce: expired, expires_at: new Date(Date.now() - 1000).toISOString() });
  assert.equal(await store!.consumeNonce({ nonce: expired, network: 'devnet', mint: 'MintAAA', accountId: '42', wallet: 'WalletA' }), null);
  await supabaseAdmin!().from('claim_nonces').delete().in('nonce', [nonce, expired]);
});

test('disputes are stored against the open claim and listed for the approver', { skip: !configured && 'Supabase not configured' }, async () => {
  const id = fresh();
  const r = { ...(await row(id, mint())), pool: `pool-${randomBytes(6).toString('hex')}` };
  assert.ok(await store!.reserveLink(r, { prevMint: null }));
  assert.ok(await store!.markHatched('devnet', id, r.mint));
  const c = await store!.insertClaim({ network: 'devnet', canonical_id: id, mint: r.mint, platform: 'github', action: 'claim', account_id: '42', account_login: 'tester', verified_at: new Date().toISOString(), destination: 'DestOne1111111111111111111111111111111111111' });
  await store!.insertDispute({ network: 'devnet', claim_id: c.id, canonical_id: id, contact: 'me@example.com', reason: 'I run this repo, not them.' });
  const ds = await store!.disputesFor([c.id]);
  assert.equal(ds.length, 1);
  assert.equal(ds[0]!.contact, 'me@example.com');
  // Too-short reasons are refused by the database too.
  await assert.rejects(() => store!.insertDispute({ network: 'devnet', claim_id: c.id, canonical_id: id, contact: 'me@example.com', reason: 'short' }));
  await store!.updateClaim(c.id, { status: 'rejected' }, ['pending']);
});

test('X post-a-code verification (stubbed oEmbed): matches, refusals, single use, expiry, deleted original, session binding', { skip: !configured && 'Supabase not configured' }, async () => {
  const { issueXCode, verifyXClaim, NOT_PUBLIC } = await import('../src/lib/server/links/x.ts');
  const { snowflakeAt } = await import('../src/lib/links/claimRules.ts');
  const origId = `9${randomBytes(6).readUIntBE(0, 6)}`;
  const id = `x:status:${origId}`;
  ids.push(id);
  const { Keypair } = await import('@solana/web3.js');
  const r = { ...(await row(id, Keypair.generate().publicKey.toBase58())), kind: 'x_post' as const, display_url: `https://x.com/i/status/${origId}`, pool: `pool-${randomBytes(6).toString('hex')}` };
  assert.ok(await store!.reserveLink(r, { prevMint: null }));
  assert.ok(await store!.markHatched('devnet', id, r.mint));

  const session = randomBytes(16).toString('hex');
  // A fake oEmbed: the original by @ShroomsGotSol; code posts by whoever / with whatever text each case sets.
  const posts = new Map<string, { author_url?: string; html?: string } | null>();
  posts.set(origId, { author_url: 'https://x.com/ShroomsGotSol', html: '<p>original</p>' });
  const oembed = async (url: string) => posts.get(url.split('/').pop()!) ?? null;
  const codePost = (handle: string, text: string, at = Date.now() + 5_000) => {
    const pid = snowflakeAt(at);
    posts.set(pid, { author_url: `https://x.com/${handle}`, html: `<p>${text}</p>` });
    return `https://x.com/${handle}/status/${pid}`;
  };
  const verify = (code: string, postUrl: string, s = session) => verifyXClaim({ mint: r.mint, code, postUrl, sessionId: s }, oembed);

  const a = await issueXCode(r.mint, session);
  await assert.rejects(() => verify(a.code, codePost('someone_else', a.code)), /isn't from the X account that posted the original/);
  await assert.rejects(() => verify(a.code, codePost('shroomsgotsol', 'hatch-ZZZZ-ZZ')), /doesn't contain your code/);
  await assert.rejects(() => verify('not-a-code', codePost('shroomsgotsol', a.code)), /Get a code first/);
  await assert.rejects(() => verify(a.code, codePost('shroomsgotsol', a.code, Date.now() - 10 * 60_000)), /made before this code was issued/);
  await assert.rejects(() => verify(a.code, codePost('shroomsgotsol', a.code), randomBytes(16).toString('hex')), /not for this coin or this browser/);
  const ok = await verify(a.code, codePost('shroomsgotsol', `verifying ${a.code} for hatch`));
  assert.equal(ok.platform, 'x');
  assert.equal(ok.login, '@ShroomsGotSol');
  assert.equal(ok.accountId, 'shroomsgotsol');
  assert.match(ok.evidence!, /^https:\/\/x\.com\/ShroomsGotSol\/status\/\d+$/);
  // Reusing the same code is refused.
  await assert.rejects(() => verify(a.code, codePost('shroomsgotsol', a.code)), /already used/);
  // An expired code is refused.
  const b = await issueXCode(r.mint, session);
  await supabaseAdmin!().from('x_claim_codes').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('code', b.code);
  await assert.rejects(() => verify(b.code, codePost('shroomsgotsol', b.code)), /expired/);
  // The original deleted or made private: refused with the exact copy.
  const c = await issueXCode(r.mint, session);
  posts.set(origId, null);
  await assert.rejects(() => verify(c.code, codePost('shroomsgotsol', c.code)), { message: NOT_PUBLIC });
  await supabaseAdmin!().from('x_claim_codes').delete().eq('mint', r.mint);
});
