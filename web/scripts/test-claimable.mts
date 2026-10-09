// Claimable creator fees shared by the web My Hatches page and /api/hatches (src/lib/claimable.ts). Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import { claimableByQuote, claimableJson, claimableTotalsJson } from '../src/lib/claimable.ts';

const SOL = { address: 'So11111111111111111111111111111111111111112', programId: 't', isToken2022: false, isNativeSol: true, decimals: 9, multiplier: 1 };
const NVDAX = { address: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', programId: 't', isToken2022: true, isNativeSol: false, decimals: 8, multiplier: 1 };
const pool = (quote: typeof SOL, raw: string, base = '0') => ({
  quote,
  fees: {
    creatorQuote: new Decimal(raw).div(new Decimal(10).pow(quote.decimals)),
    creatorBase: new Decimal(base),
    partnerQuote: new Decimal(0), partnerBase: new Decimal(0),
    creatorQuoteRaw: raw, creatorBaseRaw: base,
    creatorEarnedQuote: new Decimal(0), creatorClaimedQuote: new Decimal(0),
  },
});

test('GCHIP: 48,060 lamports unclaimed reads 0.0₄4806 SOL, never 0', () => {
  const j = claimableJson(pool(SOL, '48060'), 'SOL');
  assert.deepEqual(j, { amount: '0.0₄4806', ui: '0.00004806', raw: '48060', decimals: 9, symbol: 'SOL', hasFees: true });
  assert.deepEqual(claimableTotalsJson([pool(SOL, '48060')], () => 'SOL'), [{ symbol: 'SOL', amount: '0.0₄4806', ui: '0.00004806' }]);
});

test('totals add up exactly per quote token and skip pools with nothing to claim', () => {
  const pools = [pool(SOL, '48060'), pool(NVDAX, '1415307'), pool(SOL, '0'), pool(SOL, '1')];
  const t = claimableTotalsJson(pools, (m) => (m === SOL.address ? 'SOL' : 'NVDAx'));
  assert.deepEqual(t, [
    { symbol: 'SOL', amount: '0.0₄4806', ui: '0.000048061' },
    { symbol: 'NVDAx', amount: '0.01415', ui: '0.01415307' },
  ]);
  assert.equal(claimableByQuote(pools).length, 2);
});
