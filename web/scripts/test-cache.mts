// Unit tests: stale-while-revalidate cache for chain-read API routes, and pool JSON round-trip. Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Decimal from 'decimal.js';
import { _resetSwr, swr } from '../src/lib/server/swrCache.ts';
import { poolFromJson, poolToJson } from '../src/lib/dbc/poolJson.ts';
import type { HatchPool } from '../src/lib/dbc/pool.ts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('swr: fresh hits are cached; concurrent callers share one upstream load', async () => {
  _resetSwr();
  let calls = 0;
  const load = async () => {
    calls++;
    await sleep(20);
    return calls;
  };
  const [a, b, c] = await Promise.all([swr('k', 1000, load), swr('k', 1000, load), swr('k', 1000, load)]);
  assert.equal(calls, 1);
  assert.deepEqual([a.value, b.value, c.value], [1, 1, 1]);
  assert.equal((await swr('k', 1000, load)).value, 1);
  assert.equal(calls, 1);
});

test('swr: a failed refresh serves the last good value (stale), then backs off', async () => {
  _resetSwr();
  await swr('s', 10, async () => 'good');
  await sleep(15); // expired
  let tries = 0;
  const failing = async () => {
    tries++;
    throw new Error('429 upstream');
  };
  const r = await swr('s', 10, failing);
  assert.equal(r.value, 'good');
  assert.equal(r.stale, true);
  const again = await swr('s', 10, failing); // within the retry backoff: no new upstream call
  assert.equal(again.value, 'good');
  assert.equal(tries, 1);
});

test('swr: errors only when there has never been a good value', async () => {
  _resetSwr();
  await assert.rejects(swr('never', 1000, async () => { throw new Error('down'); }), /down/);
});

test('swr: store() keeps a value out of the cache (e.g. 0 holders after trades)', async () => {
  _resetSwr();
  let n = 0;
  const load = async () => ++n;
  await swr('z', 1000, load, { store: (v) => v !== 1 });
  assert.equal((await swr('z', 1000, load, { store: (v) => v !== 1 })).value, 2); // the 1 was not cached
  assert.equal((await swr('z', 1000, load)).value, 2); // 2 was
});

test('pool JSON: Decimal amounts survive the round trip', () => {
  const pool = {
    address: 'p', baseMint: 'm', configKey: 'c', presetId: 'MEME', creator: 'x',
    quote: { address: 'So11111111111111111111111111111111111111112', programId: 't', isToken2022: false, isNativeSol: true, decimals: 9, multiplier: 1 },
    baseDecimals: 6, price: new Decimal('0.0000000312'), progress: 0.03, quoteReserveUi: new Decimal('0.3337'), thresholdUi: new Decimal('10'),
    status: 'INCUBATING', isMigrated: false, dammV2Pool: null,
    feeSchedule: { mode: 1, cliffFeeNumerator: '500000000', numberOfPeriod: 12, periodFrequency: '5', reductionFactor: '1', activationType: 1 },
    activationPoint: '1791000000', legacyConfig: false, creatorFeePct: 50, baseVault: 'bv', quoteVault: 'qv',
    fees: { creatorQuote: new Decimal('0.0067'), creatorBase: new Decimal(0), partnerQuote: new Decimal('0.0067'), partnerBase: new Decimal(0), creatorQuoteRaw: '6715368', creatorBaseRaw: '0' },
  } as unknown as HatchPool;
  const back = poolFromJson(JSON.parse(JSON.stringify(poolToJson(pool))));
  assert.ok(Decimal.isDecimal(back.price) && back.price.eq(pool.price));
  assert.ok(back.quoteReserveUi.eq('0.3337') && back.thresholdUi.eq(10));
  assert.ok(back.fees.creatorQuote.eq('0.0067') && back.fees.partnerBase.isZero());
  assert.equal(back.fees.creatorQuoteRaw, '6715368');
  assert.deepEqual(back.feeSchedule, pool.feeSchedule);
});
