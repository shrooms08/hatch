// The launch copy for one config, built in one place so the launch form, the token page and the
// extension's side panel (via /api/presets) say exactly the same thing.

/** Server-computed copy for a config (GET /api/presets `copy`), keyed by copyKey(). */
export type PresetCopy = {
  /** "Buyers pay with SOL. Every buy nudges the price up. At 10 SOL it hatches… Fees start at 50%…" */
  howItWorks: string;
  /** The fee sentence alone (lib/dbc/feeSchedule feeSentence). */
  fee: string;
  /** Stock-paired: "This token is not the stock…" (null otherwise). */
  honest: string | null;
  shield: boolean;
  creatorPct: number;
};

export const copyKey = (preset: string, stockTicker?: string | null) => (preset === 'STOCK' ? `STOCK:${(stockTicker ?? '').toUpperCase()}` : preset);

export function howItWorksText(o: { quoteSymbol: string; stockPaired: boolean; threshold: string | null; fee: string }): string {
  const goal = o.threshold ? `At ${o.threshold} ${o.quoteSymbol} it hatches into a Meteora pool.` : 'When the goal is reached it hatches into a Meteora pool.';
  return `Buyers pay with ${o.quoteSymbol}${o.stockPaired ? ' or SOL' : ''}. Every buy nudges the price up. ${goal} ${o.fee}`;
}
