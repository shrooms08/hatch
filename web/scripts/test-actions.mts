// Unit tests for the Solana Actions (Blinks) helpers (src/lib/server/actions.ts). Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS_CORS_HEADERS } from '@solana/actions';
import { ACTIONS_JSON, MAX_BLINK_SOL, actionHeaders, blinkMetadata, parseBlinkSol, type BlinkToken } from '../src/lib/server/actions.ts';

const ORIGIN = 'https://hatchfun.vercel.app';
const token = (o: Partial<BlinkToken> = {}): BlinkToken => ({
  mint: 'HFXWB1araE22DeLP9zP2K3iu4rcE7N5qUvPgSQ78zow5',
  name: 'Green Chip Hatchling',
  symbol: 'GCHIP',
  icon: 'https://example.r2.dev/images/x.png',
  stockName: null,
  progressPct: 0.1,
  hatched: false,
  dammV2Pool: null,
  ...o,
});

test('amounts: plain decimals within (0, 1] SOL only', () => {
  assert.equal(parseBlinkSol('0.01'), '0.01');
  assert.equal(parseBlinkSol(' 1 '), '1');
  for (const bad of ['', 'abc', '-1', '1e-3', '0', '0x10', '1.0000000001', '0.0001', String(MAX_BLINK_SOL + 0.000001), '2', undefined, null]) {
    assert.throws(() => parseBlinkSol(bad), String(bad));
  }
});

test('headers: the package CORS headers plus action version and mainnet/devnet chain id', () => {
  const h = actionHeaders();
  for (const [k, v] of Object.entries(ACTIONS_CORS_HEADERS)) assert.equal(h[k], v, k);
  assert.equal(h['X-Action-Version'], '2.4');
  assert.match(h['X-Blockchain-Ids'], /^solana:/);
});

test('actions.json maps token pages to the buy action', () => {
  assert.deepEqual(ACTIONS_JSON.rules[0], { pathPattern: '/token/*', apiPath: '/api/actions/buy/*' });
});

test('metadata: three preset buttons and a custom amount capped at 1 SOL, absolute hrefs', () => {
  const m = blinkMetadata(token(), ORIGIN);
  assert.equal(m.title, 'Buy $GCHIP on Hatch');
  assert.ok(!m.disabled);
  const actions = m.links!.actions;
  assert.deepEqual(actions.slice(0, 3).map((a) => a.label), ['0.01 SOL', '0.05 SOL', '0.1 SOL']);
  assert.equal(actions[0].href, `${ORIGIN}/api/actions/buy/${token().mint}?amount=0.01`);
  assert.equal(actions[3].href, `${ORIGIN}/api/actions/buy/${token().mint}?amount={amount}`);
  assert.equal(actions[3].parameters![0].name, 'amount');
  assert.equal((actions[3].parameters![0] as { max?: number }).max, 1);
  assert.match(m.description, /0\.10% to hatch/);
});

test('stock pools say "Priced in tokenized NVIDIA", never "backed"', () => {
  const m = blinkMetadata(token({ stockName: 'NVIDIA' }), ORIGIN);
  assert.match(m.description, /Priced in tokenized NVIDIA\./);
  assert.doesNotMatch(JSON.stringify(m), /backed/i);
});

test('graduated: a disabled action pointing to the Meteora pool, no buy buttons', () => {
  const m = blinkMetadata(token({ hatched: true, dammV2Pool: 'Pool1111111111111111111111111111111111111111' }), ORIGIN);
  assert.equal(m.disabled, true);
  assert.equal(m.label, 'Graduated, trade on Meteora');
  assert.equal(m.links, undefined);
  assert.match(m.description, /meteora\.ag\/dammv2\/Pool1111/);
});
