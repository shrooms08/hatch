// Holdings, pure part (unit-tested): which of a wallet's token accounts are Hatch tokens worth listing.
// Only mints with a Hatch pool (current or legacy config) count; zero balances are dropped; several
// accounts of one mint add up.
export type WalletTokenAccount = { mint: string; amountRaw: string; decimals: number };
export type HatchPoolRef = { presetId: string | null };

export function holdingsFrom<P extends HatchPoolRef>(accounts: WalletTokenAccount[], poolsByMint: Map<string, P>): { mint: string; amountRaw: bigint; decimals: number; pool: P }[] {
  const byMint = new Map<string, { mint: string; amountRaw: bigint; decimals: number; pool: P }>();
  for (const a of accounts) {
    const pool = poolsByMint.get(a.mint);
    if (!pool || pool.presetId === null) continue;
    let amount: bigint;
    try {
      amount = BigInt(a.amountRaw);
    } catch {
      continue;
    }
    if (amount <= BigInt(0)) continue;
    const prev = byMint.get(a.mint);
    byMint.set(a.mint, { mint: a.mint, amountRaw: (prev?.amountRaw ?? BigInt(0)) + amount, decimals: a.decimals, pool });
  }
  return [...byMint.values()];
}
