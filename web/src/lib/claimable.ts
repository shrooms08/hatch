// Claimable creator fees, one logic for the web My Hatches page and GET /api/hatches (which the extension's
// side panel shows as-is). Amounts are the pool's unclaimed creator quote fees (HatchPool.fees.creatorQuote,
// exact Decimals in UI units, scaled multiplier applied); display strings come from formatAmount, so tiny
// amounts read like the web ("0.0₄4806"), never as 0.
import Decimal from 'decimal.js';
import type { HatchPool } from '@/lib/dbc/pool';
import { formatAmount } from '@/lib/format/amount';

type FeePool = Pick<HatchPool, 'quote' | 'fees'>;

/** Anything to claim (quote or base side). */
export const hasCreatorFees = (p: Pick<HatchPool, 'fees'>) => !p.fees.creatorQuote.isZero() || !p.fees.creatorBase.isZero();

/** Per quote token (SOL pools and NVDAx pools add up separately), in first-seen order. */
export function claimableByQuote<P extends FeePool>(pools: P[]): { pool: P; sum: Decimal }[] {
  const totals = new Map<string, { pool: P; sum: Decimal }>();
  for (const p of pools.filter(hasCreatorFees)) {
    const t = totals.get(p.quote.address) ?? { pool: p, sum: new Decimal(0) };
    t.sum = t.sum.add(p.fees.creatorQuote);
    totals.set(p.quote.address, t);
  }
  return [...totals.values()];
}

/** One hatch's claimable fees for the API: display string, exact UI decimal and raw units. */
export function claimableJson(p: FeePool, symbol: string) {
  return {
    amount: formatAmount(p.fees.creatorQuote),
    ui: p.fees.creatorQuote.toFixed(),
    raw: p.fees.creatorQuoteRaw,
    decimals: p.quote.decimals,
    symbol,
    hasFees: hasCreatorFees(p),
  };
}

/** Totals for the API (what the web shows as "Claimable"). */
export function claimableTotalsJson(pools: FeePool[], symbolOf: (quoteMint: string) => string) {
  return claimableByQuote(pools).map(({ pool, sum }) => ({ symbol: symbolOf(pool.quote.address), amount: formatAmount(sum), ui: sum.toFixed() }));
}
