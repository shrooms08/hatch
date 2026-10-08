// Pure helpers for the Home volume stat (see lib/server/stats.ts). No network, unit-tested in
// scripts/test-stats.mts.
import BN from 'bn.js';

export type TokenBalance = { accountIndex: number; mint: string; owner?: string; uiTokenAmount: { amount: string } };
export type RawTx = {
  meta: { err: unknown; preTokenBalances?: TokenBalance[]; postTokenBalances?: TokenBalance[] } | null;
  transaction: { message: { accountKeys: ({ pubkey: string } | string)[] } };
};

const keyAt = (tx: RawTx, i: number) => {
  const k = tx.transaction.message.accountKeys[i];
  return typeof k === 'string' ? k : k?.pubkey;
};

/**
 * Absolute change of ONE pool's quote vault in a transaction, in raw units. The vault is matched by
 * its account address: the DBC pool authority owns the vaults of every DBC pool, so matching by
 * owner + mint could pick another pool's vault when a transaction touches several pools.
 */
export function quoteVaultDelta(tx: RawTx, quoteVault: string): BN {
  const meta = tx.meta;
  if (!meta || meta.err) return new BN(0);
  const amount = (list?: TokenBalance[]) => new BN(list?.find((b) => keyAt(tx, b.accountIndex) === quoteVault)?.uiTokenAmount.amount ?? '0');
  return amount(meta.postTokenBalances).sub(amount(meta.preTokenBalances)).abs();
}

export const feePayer = (tx: RawTx) => keyAt(tx, 0);

/**
 * Cross-check: trading fees collected / fee rate gives the traded volume. The fee rate is at least
 * the config's base fee and at most base + the dynamic (volatility) fee cap, so the measured volume
 * must fall inside [fees / maxRate, fees / baseRate] (with a small tolerance, since buys are measured
 * gross and sells net of fee).
 */
export function impliedVolumeRange(totalFeesRaw: bigint, baseFeeNumerator: bigint, maxFeeNumerator: bigint, denominator = BigInt(1_000_000_000)) {
  return {
    min: (totalFeesRaw * denominator) / maxFeeNumerator,
    max: (totalFeesRaw * denominator) / baseFeeNumerator,
  };
}
