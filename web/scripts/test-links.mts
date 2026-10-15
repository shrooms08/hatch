// Link coins: canonical link IDs, private lookup matching, blocklist and coin name/ticker rules (pure, no I/O).
// Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { LinkError, MAX_LINK_LENGTH, canonicalize, isLookupPrefix, linkIdHash, lookupPrefix, matchLookup } from '../src/lib/links/canonical.ts';
import { checkBlocked, blockedDomain } from '../src/lib/links/blocklist.ts';
import { isValidName, isValidTicker, sanitizeName, sanitizeTicker, suggestCoin } from '../src/lib/links/suggest.ts';

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
