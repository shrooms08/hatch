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
  if (configured && ids.length) await supabaseAdmin!().from('links').delete().eq('network', 'devnet').in('canonical_id', ids);
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
