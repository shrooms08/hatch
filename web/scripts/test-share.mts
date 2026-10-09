// Unit tests for sharing: X intent text/URL, OG meta and the OG card SVG. Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phantomBrowseUrl, shareText, xIntentUrl } from '../src/lib/share.ts';
import { tokenCardMeta, tokenCardSvg, type TokenCard } from '../src/lib/server/tokenCard.ts';

test('share: creator wording per preset', () => {
  assert.equal(
    shareText({ symbol: 'VOLT', preset: 'STOCK', stockTicker: 'NVDA', stockName: 'NVIDIA', shield: true, creator: true }),
    'I just hatched $VOLT on @MeteoraAG DBC, priced in tokenized NVIDIA. Sniper shield on. Hatch yours:'
  );
  assert.equal(shareText({ symbol: 'DOGE', preset: 'MEME', shield: true, creator: true }), 'I just hatched $DOGE on @MeteoraAG DBC, a meme coin bought with SOL. Sniper shield on. Hatch yours:');
  assert.equal(
    shareText({ symbol: 'BOT', preset: 'AI_AGENT', shield: false, creator: true }),
    'I just hatched $BOT on @MeteoraAG DBC, an AI agent token with creator-first fees. Hatch yours:'
  );
});

test('share: viewer wording shows progress; hatched drops the shield', () => {
  assert.equal(shareText({ symbol: 'T', preset: 'STOCK', stockTicker: 'TSLA', shield: true, progressPct: 37.9 }), '$T is hatching on @MeteoraAG DBC, priced in tokenized TSLA. 37% to hatch. Sniper shield on. Help fill the egg:');
  assert.match(shareText({ symbol: 'T', preset: 'MEME', shield: true, hatched: true }), /^\$T hatched on @MeteoraAG DBC.*Meteora pool:$/);
});

test('share: X intent URL encodes text and link', () => {
  const u = new URL(xIntentUrl('I just hatched $A & more:', 'https://hatchfun.vercel.app/token/abc'));
  assert.equal(u.origin + u.pathname, 'https://x.com/intent/tweet');
  assert.equal(u.searchParams.get('text'), 'I just hatched $A & more:');
  assert.equal(u.searchParams.get('url'), 'https://hatchfun.vercel.app/token/abc');
});

test('mobile: Phantom browse deep link', () => {
  assert.equal(
    phantomBrowseUrl('https://hatchfun.vercel.app/token/abc?x=1', 'https://hatchfun.vercel.app'),
    'https://phantom.app/ul/browse/https%3A%2F%2Fhatchfun.vercel.app%2Ftoken%2Fabc%3Fx%3D1?ref=https%3A%2F%2Fhatchfun.vercel.app'
  );
});

const CARD: TokenCard = {
  mint: 'Eekou3Ckcd2Hxk1MaeVepRafCH6SHU7sybNrifizUZfb', name: 'Tesla <Egg> & Co', symbol: 'TEGG', description: '', image: null,
  preset: 'STOCK', paired: 'TSLAx', stockTicker: 'TSLA', stockName: 'Tesla', shield: true, progressPct: 12.5, hatched: false, test: false,
};

test('og: meta and card escape and describe the token', () => {
  const meta = tokenCardMeta(CARD);
  assert.equal(meta.title, 'Tesla <Egg> & Co ($TEGG) on Hatch');
  assert.equal(meta.description, 'A token whose pool is priced in tokenized Tesla (TSLAx). Pay with SOL or TSLAx. 12% to hatch into a Meteora pool. Sniper shield on.');
  const svg = tokenCardSvg(CARD, 'data:image/png;base64,AA==');
  assert.ok(svg.includes('Tesla &#60;Egg&#62; &#38; Co') && !svg.includes('<Egg>'));
  for (const s of ['SNIPER SHIELD', 'paired with TSLAx', '>12%<', 'to hatch', 'width="1200" height="630"']) assert.ok(svg.includes(s), s);
});
