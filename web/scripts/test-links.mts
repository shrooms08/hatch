// Link coins: canonical link IDs, private lookup matching, blocklist and coin name/ticker rules (pure, no I/O).
// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { LinkError, MAX_LINK_LENGTH, canonicalize, isLookupPrefix, linkIdHash, lookupPrefix, matchLookup } from '../src/lib/links/canonical.ts';
import { checkBlocked, blockedDomain } from '../src/lib/links/blocklist.ts';
import { prefillUrl } from '../src/lib/links/prefill.ts';
import { feesLabel, matchesHatch, verifyListedLinks } from '../src/lib/links/listing.ts';
import { EMPTY_HATCH_CONFIGS, allConfigKeys, listedConfigKeys, type HatchConfigs } from '../src/lib/presets/index.ts';
import { isValidName, isValidTicker, sanitizeName, sanitizeTicker, suggestCoin } from '../src/lib/links/suggest.ts';
import { r2ObjectKey } from '../src/lib/server/r2.ts';
import { SafeFetchError } from '../src/lib/server/safeFetch.ts';
import { classifyFetchError } from '../src/lib/server/links/metadata.ts';
import { LINK_MAX_FIRST_BUY_SOL, maxFirstBuySol } from '../src/lib/server/links/chain.ts';
import { LinkApiError, githubRepoIdOrThrow } from '../src/lib/server/links/service.ts';

const id = (u: string) => canonicalize(u).canonicalId;

const SAME: [string, string[]][] = [
  // X / Twitter: every form of one post -> x:status:<id>
  [
    'x:status:1849123456789012345',
    [
      'https://x.com/jack/status/1849123456789012345',
      'https://twitter.com/jack/status/1849123456789012345',
      'https://mobile.twitter.com/jack/status/1849123456789012345',
      'https://mobile.x.com/jack/status/1849123456789012345',
      'https://www.twitter.com/jack/status/1849123456789012345?s=20&t=AbCdEf',
      'https://x.com/jack/status/1849123456789012345/photo/1',
      'https://x.com/jack/status/1849123456789012345/analytics',
      'https://x.com/jack/status/1849123456789012345/video/1#m',
      'https://x.com/i/web/status/1849123456789012345',
      'https://x.com/i/status/1849123456789012345',
      'https://twitter.com/jack/statuses/1849123456789012345',
      'x.com/jack/status/1849123456789012345',
      '  https://X.COM/Jack/status/1849123456789012345  ',
    ],
  ],
  // YouTube: watch, youtu.be, shorts, live, embed, mobile, timestamps, playlists -> yt:video:<id>
  [
    'yt:video:dQw4w9WgXcQ',
    [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s',
      'https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&index=4',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ?si=abcdef&t=10',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/live/dQw4w9WgXcQ?feature=shared',
      'https://www.youtube.com/embed/dQw4w9WgXcQ?start=30',
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
    ],
  ],
  // GitHub: any page inside a repo -> gh:repo:<owner>/<repo>, lowercased
  [
    'gh:repo:meteoraag/dynamic-bonding-curve',
    [
      'https://github.com/MeteoraAg/dynamic-bonding-curve',
      'https://github.com/MeteoraAg/dynamic-bonding-curve/',
      'https://github.com/meteoraag/Dynamic-Bonding-Curve/tree/main/programs',
      'https://github.com/MeteoraAg/dynamic-bonding-curve/blob/main/README.md#install',
      'https://github.com/MeteoraAg/dynamic-bonding-curve/issues/12',
      'https://github.com/MeteoraAg/dynamic-bonding-curve.git',
      'https://www.github.com/MeteoraAg/dynamic-bonding-curve?tab=readme-ov-file',
    ],
  ],
  // Web pages: host lowercased without www, no trailing slash, no fragment, no tracking params
  [
    'web:example.com/blog/post',
    [
      'https://example.com/blog/post',
      'https://www.example.com/blog/post/',
      'https://EXAMPLE.com/blog/post#section-2',
      'http://example.com/blog/post?utm_source=x&utm_medium=social&fbclid=abc',
      'https://example.com/blog/post?gclid=1&ref=hn&si=xyz',
      'https://example.com:443/blog/post',
    ],
  ],
];

for (const [want, urls] of SAME) {
  for (const u of urls) {
    test(`canonical: ${u.trim()} -> ${want}`, () => assert.equal(id(u), want));
  }
}

test('canonical: web pages keep content parameters (sorted) and drop only trackers', () => {
  assert.equal(id('https://news.ycombinator.com/item?id=41234567&utm_campaign=x'), 'web:news.ycombinator.com/item?id=41234567');
  assert.equal(id('https://shop.example.org/search?q=egg&s=2&b=1'), 'web:shop.example.org/search?b=1&q=egg&s=2');
  assert.equal(id('https://www.example.com/'), 'web:example.com');
  assert.equal(id('https://example.com:8443/a'), 'web:example.com:8443/a');
  assert.equal(id('https://gist.github.com/someone/abc123'), 'web:gist.github.com/someone/abc123');
  assert.notEqual(id('https://example.com/Path'), id('https://example.com/path'), 'paths keep their case');
});

test('canonical: kinds, display URLs and hosts', () => {
  const x = canonicalize('https://twitter.com/jack/status/20?s=21');
  assert.deepEqual([x.kind, x.platform, x.displayUrl], ['x_post', 'x', 'https://x.com/jack/status/20']);
  const y = canonicalize('https://youtu.be/dQw4w9WgXcQ?t=5');
  assert.deepEqual([y.kind, y.displayUrl], ['youtube_video', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ']);
  const g = canonicalize('https://github.com/solana-labs/solana/pulls');
  assert.deepEqual([g.kind, g.displayUrl], ['github_repo', 'https://github.com/solana-labs/solana']);
  const w = canonicalize('https://www.Example.com/a/?utm_source=1');
  assert.deepEqual([w.kind, w.host, w.displayUrl], ['web_page', 'example.com', 'https://www.example.com/a']);
});

const REJECT: [string, RegExp][] = [
  ['ftp://example.com/file', /http/],
  ['javascript:alert(1)', /http/],
  ['mailto:a@b.com', /http/],
  ['file:///etc/passwd', /http/],
  ['https://user:pass@example.com/', /username or password/],
  ['http://localhost:3000/x', /private or local/],
  ['http://myapp.local/x', /private or local/],
  ['http://intranet/x', /private or local/],
  ['http://127.0.0.1/admin', /IP address/],
  ['http://10.0.0.5/', /IP address/],
  ['http://192.168.1.1/', /IP address/],
  ['http://[::1]/', /IP address/],
  ['http://2130706433/', /IP address/], // decimal 127.0.0.1
  ['https://x.com/home', /X posts/],
  ['https://x.com/settings/account', /X posts/],
  ['https://x.com/search?q=solana', /X posts/],
  ['https://x.com/i/flow/login', /X posts/],
  ['https://x.com/jack', /X posts/],
  ['https://x.com/jack/status/notanumber', /X posts/],
  ['https://www.youtube.com/results?search_query=eggs', /YouTube videos/],
  ['https://www.youtube.com/@channel', /YouTube videos/],
  ['https://www.youtube.com/watch?v=short', /YouTube videos/],
  ['https://accounts.youtube.com/', /YouTube videos|private|not/],
  ['https://github.com/login', /GitHub repositories/],
  ['https://github.com/settings/profile', /GitHub repositories/],
  ['https://github.com/search?q=dbc', /GitHub repositories/],
  ['https://github.com/MeteoraAg', /GitHub repositories/],
  ['', /Paste a link/],
  ['not a url at all', /valid link|private/],
  [`https://example.com/${'a'.repeat(MAX_LINK_LENGTH)}`, /too long/],
];
for (const [u, why] of REJECT) {
  test(`canonical rejects: ${u.slice(0, 60) || '(empty)'}`, () => {
    assert.throws(() => canonicalize(u), (e: unknown) => e instanceof LinkError && why.test((e as Error).message), `${u} -> ${(() => { try { return canonicalize(u).canonicalId; } catch (e) { return (e as Error).message; } })()}`);
  });
}

test('id hash: sha256 hex of the canonical id; lookup sends only an 8-hex prefix', async () => {
  const h = await linkIdHash('x:status:20');
  assert.equal(h, createHash('sha256').update('x:status:20').digest('hex'));
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(lookupPrefix(h), h.slice(0, 8));
  assert.ok(isLookupPrefix(lookupPrefix(h)));
  for (const bad of ['', 'abc', 'ABCDEF12', '1234567', '123456789', 'g1234567', null, 12345678]) assert.equal(isLookupPrefix(bad), false, String(bad));
});

test('lookup matching: the client keeps only its exact hash among prefix siblings', async () => {
  const mine = await linkIdHash('yt:video:dQw4w9WgXcQ');
  const sibling = lookupPrefix(mine) + 'f'.repeat(56); // same prefix, different link
  const entries = [{ h: sibling, mint: 'other' }, { h: mine, mint: 'mine' }];
  assert.equal(matchLookup(entries, mine)?.mint, 'mine');
  assert.equal(matchLookup([{ h: sibling, mint: 'other' }], mine), null);
  assert.equal(matchLookup([], mine), null);
});

test('blocklist: domains (and subdomains), and whole words only', () => {
  assert.equal(blockedDomain('www.pornhub.com'), 'pornhub.com');
  assert.equal(blockedDomain('fr.pornhub.com'), 'pornhub.com');
  assert.equal(blockedDomain('notpornhub.com'), null);
  assert.equal(checkBlocked({ host: 'onlyfans.com' })?.category, 'domain');
  assert.equal(checkBlocked({ texts: ['Hot NSFW clip'] })?.category, 'adult');
  assert.equal(checkBlocked({ texts: ['Beheading video'] })?.category, 'gore');
  assert.equal(checkBlocked({ texts: ['School shooting live'] })?.category, 'tragedy');
  assert.equal(checkBlocked({ texts: ['RIP to a legend'] })?.category, 'tragedy');
  assert.equal(checkBlocked({ texts: ['Earthquake victims fund'] })?.category, 'tragedy');
  assert.equal(checkBlocked({ texts: ['BabyShark'] })?.category, 'minors');
  assert.equal(checkBlocked({ texts: ['KIDS'] })?.category, 'minors');
  for (const ok of ['Kidney health tips', 'Sussex University', 'Essex', 'Solana Breakpoint', 'Grip strength', 'Childish Gambino', 'Deadline extended', 'Dynamic Bonding Curve']) {
    assert.equal(checkBlocked({ texts: [ok] }), null, ok);
  }
});

test('names and tickers: sanitized and length-limited', () => {
  assert.equal(sanitizeName('  Hello   <script>alert(1)</script> World!  '), 'Hello script alert 1 script Worl');
  assert.equal(sanitizeName('Visit https://evil.example now'), 'Visit now');
  assert.ok(sanitizeName('x'.repeat(80)).length <= 32);
  assert.equal(sanitizeTicker('$doge-2!'), 'DOGE2');
  assert.equal(sanitizeTicker('ÉCOLE'), 'ECOLE');
  assert.equal(sanitizeTicker('abcdefghijklmnop'), 'ABCDEFGHIJ');
  assert.ok(isValidName('Green Chip'));
  assert.ok(!isValidName(''));
  assert.ok(!isValidName('a'.repeat(33)));
  assert.ok(isValidTicker('GCHIP'));
  for (const bad of ['A', 'gchip', 'TOOLONGTICKER', 'G-CHIP', '']) assert.ok(!isValidTicker(bad), bad);
});

test('suggestions: deterministic name + ticker from the link title', () => {
  assert.deepEqual(suggestCoin({ title: 'Rick Astley - Never Gonna Give You Up (Official Video)', fallback: 'youtube' }), { name: 'Rick Astley Never Gonna', ticker: 'RICK' });
  assert.deepEqual(suggestCoin({ title: 'dynamic-bonding-curve', fallback: 'MeteoraAg' }), { name: 'Dynamic Bonding Curve', ticker: 'DYNAMI' });
  assert.deepEqual(suggestCoin({ title: 'just setting up my twttr', fallback: '@jack' }), { name: 'Setting Up Twttr', ticker: 'SETTIN' });
  const s = suggestCoin({ title: '', fallback: 'example.com' });
  assert.ok(isValidName(s.name) && isValidTicker(s.ticker), JSON.stringify(s));
  assert.deepEqual(suggestCoin({ title: 'Same title', fallback: 'x' }), suggestCoin({ title: 'Same title', fallback: 'x' }));
});

test('devnet uploads go under devnet/; mainnet keys are unchanged', () => {
  assert.equal(r2ObjectKey('images/abc.png', 'devnet'), 'devnet/images/abc.png');
  assert.equal(r2ObjectKey('/metadata/abc.json', 'devnet'), 'devnet/metadata/abc.json');
  assert.equal(r2ObjectKey('images/abc.png', 'mainnet-beta'), 'images/abc.png');
  assert.equal(r2ObjectKey('releases/hatch-extension-v0.6.3.zip', 'mainnet-beta'), 'releases/hatch-extension-v0.6.3.zip');
  assert.equal(r2ObjectKey('shield/v2/pool.json', 'mainnet-beta'), 'shield/v2/pool.json');
});

test('GitHub API failures: rate limits and outages say "try again", never hatch without the repo id', () => {
  const limited = classifyFetchError(new SafeFetchError('URL returned HTTP 403'), 'github');
  assert.equal(limited.retryable, true);
  assert.match(limited.message, /GitHub is limiting requests/);
  assert.equal(classifyFetchError(new SafeFetchError('URL returned HTTP 429'), 'github').retryable, true);
  assert.equal(classifyFetchError(new SafeFetchError('URL returned HTTP 502'), 'github').retryable, true);
  assert.equal(classifyFetchError(new SafeFetchError('Download timed out'), 'github').retryable, true);
  const missing = classifyFetchError(new SafeFetchError('URL returned HTTP 404'), 'github');
  assert.equal(missing.retryable, false);
  assert.match(missing.message, /private, deleted, or not found/);
  assert.equal(classifyFetchError(new SafeFetchError('URL returned HTTP 403'), 'web').retryable, false, 'a 403 elsewhere is not a rate limit');
  assert.throws(() => githubRepoIdOrThrow({ githubRepoId: null }), (e: unknown) => e instanceof LinkApiError && e.status === 503 && /Try again/.test(e.message));
  assert.throws(() => githubRepoIdOrThrow({}), LinkApiError);
  assert.equal(githubRepoIdOrThrow({ githubRepoId: 123456 }), 123456);
});

test('first buy cap: 1 SOL by default, LINK_MAX_FIRST_BUY_SOL overrides (sane values only)', () => {
  const saved = process.env.LINK_MAX_FIRST_BUY_SOL;
  try {
    delete process.env.LINK_MAX_FIRST_BUY_SOL;
    assert.equal(LINK_MAX_FIRST_BUY_SOL, 1);
    assert.equal(maxFirstBuySol(), 1);
    process.env.LINK_MAX_FIRST_BUY_SOL = '0.5';
    assert.equal(maxFirstBuySol(), 0.5);
    for (const bad of ['0', '-1', 'abc', '1000']) {
      process.env.LINK_MAX_FIRST_BUY_SOL = bad;
      assert.equal(maxFirstBuySol(), 1, bad);
    }
  } finally {
    if (saved === undefined) delete process.env.LINK_MAX_FIRST_BUY_SOL;
    else process.env.LINK_MAX_FIRST_BUY_SOL = saved;
  }
});

test('/link?u= prefill: http(s) URLs only, anything else ignored', () => {
  assert.equal(prefillUrl('https://www.youtube.com/watch?v=jNQXAC9IVRw'), 'https://www.youtube.com/watch?v=jNQXAC9IVRw');
  assert.equal(prefillUrl(' http://example.com/a '), 'http://example.com/a');
  for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'ftp://x.com', 'not a url', '', undefined, ['https://a.com'], 'https://a.com/' + 'x'.repeat(MAX_LINK_LENGTH)])
    assert.equal(prefillUrl(bad), null, String(bad).slice(0, 40));
});

const HC: HatchConfigs = {
  ...EMPTY_HATCH_CONFIGS,
  network: 'devnet',
  configs: { MEME: 'cfgMeme', AI_AGENT: 'cfgAgent' } as HatchConfigs['configs'],
  stocks: { NVDA: { config: 'cfgNvda' } } as unknown as HatchConfigs['stocks'],
  link: { config: 'cfgLink2', vault: 'VAULT', legacyConfigs: ['cfgLink1'] },
};

test('Hatches list configs: launch configs plus the current and every legacy LINK config; none where LINK_CONFIG is unset', () => {
  assert.deepEqual(listedConfigKeys(HC).sort(), ['cfgAgent', 'cfgLink1', 'cfgLink2', 'cfgMeme', 'cfgNvda']);
  // Launch-only paths (shield receipts, creator scans) keep excluding link configs.
  assert.deepEqual(allConfigKeys(HC).sort(), ['cfgAgent', 'cfgMeme', 'cfgNvda']);
  // Mainnet today: no LINK config, so the list is exactly the launch configs (automatic once LINK_CONFIG is set).
  const mainnet = { ...HC, link: null };
  assert.deepEqual(listedConfigKeys(mainnet), allConfigKeys(mainnet));
});

const linkRow = (o: Record<string, unknown> = {}) => ({ kind: 'youtube_video', mint: 'MZmint', pool: 'MZpool', status: 'hatched', title: 'Me at the zoo', display_url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', owner_platform: 'youtube', owner_handle: '@jawed', claimed_wallet: null, hatched_at: '2026-10-15T17:00:00Z', ...o });
const linkPool = (o: Record<string, unknown> = {}) => ({ baseMint: 'MZmint', address: 'MZpool', creator: 'VAULT', isLink: true, ...o });

test('listed link coins: only pools the links table knows (same mint and pool) whose creator is the vault or the claimer', () => {
  const ok = verifyListedLinks([linkPool()], [linkRow()], 'VAULT');
  assert.deepEqual(ok.get('MZmint'), { platform: 'youtube', title: 'Me at the zoo', displayUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw', ownerHandle: '@jawed', hatchedAt: 1792083600 });
  // Anyone can create a pool under the public LINK config: such pools are never listed as link coins.
  assert.equal(verifyListedLinks([linkPool({ baseMint: 'rogue', address: 'roguePool', creator: 'Mallory' })], [linkRow()], 'VAULT').size, 0);
  assert.equal(verifyListedLinks([linkPool({ creator: 'Mallory' })], [linkRow()], 'VAULT').size, 0);
  assert.equal(verifyListedLinks([linkPool({ address: 'otherPool' })], [linkRow()], 'VAULT').size, 0);
  assert.equal(verifyListedLinks([linkPool()], [linkRow({ status: 'reserved' })], 'VAULT').size, 0);
  // Claimed: the owner's wallet is the creator now.
  assert.equal(verifyListedLinks([linkPool({ creator: 'OwnerW' })], [linkRow({ status: 'claimed', claimed_wallet: 'OwnerW' })], 'VAULT').size, 1);
  // Platform falls back to the link kind.
  assert.equal(verifyListedLinks([linkPool()], [linkRow({ owner_platform: null, kind: 'github_repo' })], 'VAULT').get('MZmint')?.platform, 'github');
});

test('Hatches list: "Link coins" tab, status tabs, and search by name, ticker, mint or the link title', () => {
  const link = { status: 'INCUBATING' as const, isLink: true, baseMint: 'MZmint', link: { platform: 'youtube' as const, title: 'Me at the zoo', displayUrl: 'x', ownerHandle: '@jawed', hatchedAt: null } };
  const meme = { status: 'INCUBATING' as const, isLink: false, baseMint: 'MEMEmint', link: undefined };
  const md = { name: 'Me Zoo', symbol: 'MZ' };
  assert.ok(matchesHatch(link, 'LINK', '', md));
  assert.ok(!matchesHatch(meme, 'LINK', '', { name: 'Doge', symbol: 'DOGE' }));
  assert.ok(matchesHatch(link, 'ALL', '', md) && matchesHatch(link, 'INCUBATING', '', md) && !matchesHatch(link, 'HATCHED', '', md));
  assert.ok(matchesHatch(link, 'ALL', 'zoo', md));
  assert.ok(matchesHatch(link, 'ALL', 'at the', { name: 'Me Zoo', symbol: 'MZ' }), 'title only');
  assert.ok(matchesHatch(link, 'LINK', '$mz', md));
  assert.ok(!matchesHatch(meme, 'ALL', 'zoo', { name: 'Doge', symbol: 'DOGE' }));
});

test('My Hatches label: fees held for the owner (unclaimed) / go to the owner (claimed)', () => {
  assert.equal(feesLabel({ platform: 'youtube', ownerHandle: '@jawed' }, false), 'fees held for @jawed on YouTube');
  assert.equal(feesLabel({ platform: 'x', ownerHandle: '@jack' }, true), 'fees go to @jack on X');
  assert.equal(feesLabel({ platform: 'web', ownerHandle: 'example.com' }, false), 'fees held for example.com');
  assert.equal(feesLabel({ platform: 'github', ownerHandle: null }, false), "fees held for the link's owner");
});
