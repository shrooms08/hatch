// Holder counting, pure (unit-tested): distinct owners with a non-zero balance, excluding the curve's own
// accounts (its vaults and the pool authority that owns them).
export type TokenAccountLite = { address: string; owner: string; amount: bigint };

export function countHolders(accounts: TokenAccountLite[], exclude: { owners: string[]; accounts: string[] }): number {
  const owners = new Set<string>();
  for (const a of accounts) {
    if (a.amount <= BigInt(0)) continue;
    if (exclude.owners.includes(a.owner) || exclude.accounts.includes(a.address)) continue;
    owners.add(a.owner);
  }
  return owners.size;
}

/** A pool that has seen trades (reserve or fees) should not have a "0 holders" answer cached. */
export const hasTraded = (p: { quoteReserveRaw: string; feesRaw: string[] }) => p.quoteReserveRaw !== '0' || p.feesRaw.some((f) => f !== '0');
