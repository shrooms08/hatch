// Unit tests for the sniper receipt (src/lib/server/shield.ts). Run: pnpm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseFeeNumerator, eventCoder, summarizeShield, swapsInTx, type PoolSwap } from '../src/lib/server/shield.ts';
import { baseFeeNumeratorAt, type FeeSchedule } from '../src/lib/dbc/feeSchedule.ts';

const DBC = 'dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN';
const GCHIP_POOL = 'Guefiz1ESQuA5hBWKDi8SRugcpK6uR8LrrPJds7WQxbw';
// MEME-v2 (HoRw7t…): 50% falling exponentially over 12 periods of 5 s.
const V2: FeeSchedule = { mode: 1, cliffFeeNumerator: '500000000', numberOfPeriod: 12, periodFrequency: '5', reductionFactor: '2781', activationType: 1 };
// GCHIP's buy 54Fq2oYV… at +40 s: the DBC inner instructions (event CPIs) exactly as on chain.
const GCHIP_BUY_INNER: string[] = ["TGq5We4Uqkudm6cNjqSNdTEZ94V2KCpKkt","2ioXo9nkAt26bphRv6PYrqYBNEvt4pJdk92ypfNH9wYjyUqZxm7JoA3pDi9VokCyLkiij62ptDyftZTZQxT4AbSE18Tsn4qma1N19mU3PSqE1pKvdeymGwQ1gycj52i8jCch8vFXywiWNSHxW4Dgjjvc7tjG6LfWvyXVqNHif9iWCMMvCRdesWiyycPNRodcUBVyUAKCtjUcswwg2NKnrdTEdqz5HLvETsDSPhW3y","44FY2SKwMbUFWgV1yoKm6d5YM8dnswHpRD7SP1WmWcUG1YqM3rFTFrmY6d9qFCnzmGh8DxXHNU96hY4mQiamPM7Ps4VDWSPCFEEHa3Krr2Niqa9vXapMWrwnB4erCJndtSVe5Nw2CjfixnBGW8Q3AYZhDc1YN9wrR5TGJvPFkzjFbiTJzJ8BbEuqaYyVyvMppDcbRSR3dh3gASHsAYAQWo6B2xvEZeRrQBYsMUDydnDW1epgqYran8htFXwizj2RZLcNu7X5UeK"];
const coder = eventCoder('http://localhost:1');
const swap = (o: Partial<PoolSwap>): PoolSwap => ({ signature: 's', buy: true, timestamp: 100, inputRaw: BigInt(0), feeRaw: BigInt(0), ...o });

test('decodes the real GCHIP buy from its swap event (counted once, fee = trading + protocol + referral)', () => {
  const tx = { transaction: { signatures: ['54Fq'], message: { accountKeys: [DBC] } }, meta: { err: null, innerInstructions: [{ instructions: GCHIP_BUY_INNER.map((data) => ({ programIdIndex: 0, data })) }] } };
  const swaps = swapsInTx(tx, GCHIP_POOL, coder);
  assert.equal(swaps.length, 1);
  assert.deepEqual(swaps[0], { signature: '54Fq', buy: true, timestamp: 1791497140, inputRaw: BigInt(346500000), feeRaw: BigInt(12778786) });
  assert.equal(swapsInTx(tx, 'OtherPoo11111111111111111111111111111111111', coder).length, 0, 'other pools are ignored');
  assert.equal(swapsInTx({ ...tx, meta: { ...tx.meta, err: { InstructionError: [0, 'Custom'] } } }, GCHIP_POOL, coder).length, 0, 'failed txs are ignored');
});

test('the v2 base fee is the schedule end (~1%)', () => {
  const n = Number(baseFeeNumerator(V2));
  assert.ok(n > 9_900_000 && n < 10_200_000, String(n));
});

test('summary: buys inside [start, end) only; tax is the scheduler fee above the end fee, excluding the dynamic fee', () => {
  const start = 1791497100;
  const r = summarizeShield(
    [
      swap({ signature: 'a', timestamp: start + 40, inputRaw: BigInt(346500000), feeRaw: BigInt(12778786) }), // GCHIP's real buy
      swap({ signature: 'b', timestamp: start + 60, inputRaw: BigInt(1e9), feeRaw: BigInt(1e7) }), // at end: outside
      swap({ signature: 'c', timestamp: start - 1, inputRaw: BigInt(1e9), feeRaw: BigInt(5e8) }), // before activation
      swap({ signature: 'd', buy: false, timestamp: start + 10, inputRaw: BigInt(1e9), feeRaw: BigInt(4e8) }), // a sell
    ],
    { start, end: start + 60, schedule: V2 }
  );
  // At +40 s (period 8) the scheduler charges 0.5 x (1 - 0.2781)^8 = 3.6878%; the end fee is 1.0016%.
  const scheduled = BigInt(baseFeeNumeratorAt(V2, String(start), start + 40).toString());
  assert.ok(scheduled > BigInt(36_870_000) && scheduled < BigInt(36_890_000), String(scheduled));
  assert.equal(r.buys, 1);
  assert.equal(r.feesRaw, '12778786');
  assert.equal(r.taxRaw, ((BigInt(346500000) * (scheduled - baseFeeNumerator(V2))) / BigInt(1e9)).toString());
  assert.deepEqual(r.signatures, ['a']);
});

test('a dynamic fee on top never counts as shield tax', () => {
  const start = 0;
  const plain = summarizeShield([swap({ timestamp: 30, inputRaw: BigInt(1e9), feeRaw: BigInt(1e8) })], { start, end: 60, schedule: V2 });
  const withDynamic = summarizeShield([swap({ timestamp: 30, inputRaw: BigInt(1e9), feeRaw: BigInt(1e8 + 2e6) })], { start, end: 60, schedule: V2 });
  assert.equal(withDynamic.taxRaw, plain.taxRaw);
  assert.notEqual(withDynamic.feesRaw, plain.feesRaw);
});

test('no buys in the window: zeros', () => {
  const r = summarizeShield([], { start: 0, end: 60, schedule: V2 });
  assert.deepEqual(r, { buys: 0, feesRaw: '0', taxRaw: '0', signatures: [] });
});
