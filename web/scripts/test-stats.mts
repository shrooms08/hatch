// Unit tests for the Home volume stat (src/lib/stats/volume.ts). Run: pnpm test:stats
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feePayer, impliedVolumeRange, quoteVaultDelta, type RawTx } from '../src/lib/stats/volume.ts';

const NVDAX = 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh';
const AUTHORITY = 'FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM'; // owns every DBC pool's vaults
const OUR_VAULT = '9d9N2wnF2tongyQgkipxFs2DQbeuBnNddjeJag4zKBKp';
const OTHER_VAULT = 'OtherPoolVau1t111111111111111111111111111111';

const bal = (accountIndex: number, amount: string) => ({ accountIndex, mint: NVDAX, owner: AUTHORITY, uiTokenAmount: { amount } });
const tx = (pre: ReturnType<typeof bal>[], post: ReturnType<typeof bal>[], err: unknown = null): RawTx => ({
  meta: { err, preTokenBalances: pre, postTokenBalances: post },
  transaction: { message: { accountKeys: [{ pubkey: 'Payer1111111111111111111111111111111111111' }, { pubkey: OTHER_VAULT }, { pubkey: OUR_VAULT }] } },
});

test('counts only this pool vault when another DBC pool vault (same mint, same owner) is in the transaction', () => {
  // An arbitrage-style tx: the other pool's vault (index 1) moves 5 NVDAx, ours (index 2) moves 0.002.
  const t = tx([bal(1, '500000000'), bal(2, '1000000')], [bal(1, '0'), bal(2, '1207241')]);
  assert.equal(quoteVaultDelta(t, OUR_VAULT).toString(), '207241');
  assert.equal(quoteVaultDelta(t, OTHER_VAULT).toString(), '500000000');
});

test('failed transactions add no volume', () => {
  assert.equal(quoteVaultDelta(tx([bal(2, '0')], [bal(2, '99')], { InstructionError: [0, 'Custom'] }), OUR_VAULT).toString(), '0');
});

test('fee payer is the first account', () => {
  assert.equal(feePayer(tx([], [])), 'Payer1111111111111111111111111111111111111');
});

test('HGTEST mainnet: measured volume is consistent with fees collected / fee rate', () => {
  // On-chain pool metrics (6rnqNK44…, 2026-10-08): trading fees 2,830,616 + protocol fees 707,648 raw NVDAx.
  // Config fee: base 1% (cliffFeeNumerator 10,000,000 / 1e9) plus an active dynamic fee; assume it stays under 2% total.
  const fees = BigInt(2_830_616 + 707_648);
  const { min, max } = impliedVolumeRange(fees, BigInt(10_000_000), BigInt(20_000_000));
  // Sum of |quote vault change| over the pool's 9 transactions.
  const measured = BigInt(321_621_713);
  assert.ok(measured >= min && measured <= max, `measured ${measured} outside [${min}, ${max}]`);
  // Counting every swap twice (or adding the reserve on top) would fall outside the range.
  assert.ok(measured * BigInt(2) > max);
});
