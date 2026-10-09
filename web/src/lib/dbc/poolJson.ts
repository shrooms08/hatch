// HatchPool <-> JSON (Decimal amounts as strings), so pool lists can come from a cached server route.
import Decimal from 'decimal.js';
import type { HatchPool } from './pool';

type Dec = keyof Pick<HatchPool, 'price' | 'startPrice' | 'quoteReserveUi' | 'thresholdUi'>;
const DEC: Dec[] = ['price', 'startPrice', 'quoteReserveUi', 'thresholdUi'];
const FEE_DEC = ['creatorQuote', 'creatorBase', 'partnerQuote', 'partnerBase', 'creatorEarnedQuote', 'creatorClaimedQuote'] as const;

export type PoolJson = Omit<HatchPool, Dec | 'fees' | 'totalSupply'> & Record<Dec, string> & { totalSupply: string | null } & { fees: Omit<HatchPool['fees'], (typeof FEE_DEC)[number]> & Record<(typeof FEE_DEC)[number], string> };

export function poolToJson(p: HatchPool): PoolJson {
  const out = { ...p, fees: { ...p.fees } } as unknown as Record<string, unknown> & { fees: Record<string, unknown> };
  for (const k of DEC) out[k] = p[k].toString();
  out.totalSupply = p.totalSupply?.toString() ?? null;
  for (const k of FEE_DEC) out.fees[k] = p.fees[k].toString();
  return out as unknown as PoolJson;
}

export function poolFromJson(j: PoolJson): HatchPool {
  const out = { ...j, fees: { ...j.fees } } as unknown as Record<string, unknown> & { fees: Record<string, unknown> };
  // Lists cached before startPrice/totalSupply existed may lack them.
  for (const k of DEC) out[k] = new Decimal(j[k] ?? 0);
  out.totalSupply = j.totalSupply ? new Decimal(j.totalSupply) : null;
  for (const k of FEE_DEC) out.fees[k] = new Decimal(j.fees[k]);
  return out as unknown as HatchPool;
}
