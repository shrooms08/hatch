// Solana Actions (Blinks) for Hatch tokens: pure helpers shared by /api/actions/* and /actions.json.
// Headers come from the official @solana/actions package (spec v2.4); nothing here touches keys or RPC.
import { BLOCKCHAIN_IDS, createActionHeaders, type ActionGetResponse, type ActionsJson } from '@solana/actions';
import { NETWORK, meteoraPoolUrl } from '@/lib/config/network';

/** Spec version this server implements (@solana/actions-spec 2.4.x). */
export const ACTION_VERSION = '2.4';
/** Most a single Blink buy may spend. */
export const MAX_BLINK_SOL = 1;
export const MIN_BLINK_SOL = 0.001;
export const BLINK_AMOUNTS = ['0.01', '0.05', '0.1'] as const;
/** Slippage for Blink buys: the same 1% default as the token page. */
export const BLINK_SLIPPAGE_BPS = 100;

/** CORS + X-Action-Version + X-Blockchain-Ids, exactly as the package builds them. */
export const actionHeaders = () =>
  createActionHeaders({ chainId: NETWORK === 'mainnet-beta' ? 'mainnet' : 'devnet', actionVersion: ACTION_VERSION }) as Record<string, string>;

export const ACTIONS_JSON: ActionsJson = {
  rules: [
    { pathPattern: '/token/*', apiPath: '/api/actions/buy/*' },
    { pathPattern: '/api/actions/**', apiPath: '/api/actions/**' },
  ],
};

/** A spec ActionError body. */
export const actionError = (message: string) => ({ message });

/** Exact SOL amount from user input: a plain decimal, at most 9 places, within [MIN, MAX]. Throws a user-facing message. */
export function parseBlinkSol(input: unknown): string {
  const s = String(input ?? '').trim();
  if (!/^\d*\.?\d+$/.test(s) || (s.split('.')[1]?.length ?? 0) > 9) throw new Error('Enter a SOL amount like 0.05');
  const n = Number(s);
  if (!(n > 0)) throw new Error('Enter an amount greater than zero');
  if (n < MIN_BLINK_SOL) throw new Error(`The smallest Blink buy is ${MIN_BLINK_SOL} SOL`);
  if (n > MAX_BLINK_SOL) throw new Error(`A Blink buy is capped at ${MAX_BLINK_SOL} SOL. For more, use hatchfun.vercel.app`);
  return s;
}

export type BlinkToken = {
  mint: string;
  name: string;
  symbol: string;
  icon: string;
  /** "NVIDIA" for stock pools, else null. */
  stockName: string | null;
  progressPct: number | null;
  hatched: boolean;
  /** DAMM v2 pool once hatched. */
  dammV2Pool: string | null;
};

const progressText = (p: number | null) => (p == null ? '' : `${p < 1 ? p.toFixed(2) : Math.floor(p)}% to hatch into a Meteora pool.`);

/** GET metadata: buy buttons, or a disabled "Graduated" action pointing to Meteora. */
export function blinkMetadata(t: BlinkToken, origin: string): ActionGetResponse {
  const ticker = t.symbol ? `$${t.symbol}` : t.name;
  const priced = t.stockName ? `Priced in tokenized ${t.stockName}. ` : '';
  if (t.hatched) {
    const meteora = t.dammV2Pool ? meteoraPoolUrl(t.dammV2Pool) : null;
    return {
      type: 'action',
      icon: t.icon,
      title: `${t.name} (${ticker})`,
      description: `${priced}This token has hatched: its curve is closed and it now trades in a Meteora pool.${meteora ? ` ${meteora}` : ''}`,
      label: 'Graduated, trade on Meteora',
      disabled: true,
    } as ActionGetResponse;
  }
  const href = (amount: string) => `${origin}/api/actions/buy/${t.mint}?amount=${amount}`;
  return {
    type: 'action',
    icon: t.icon,
    title: `Buy ${ticker} on Hatch`,
    description: `${t.name}. ${priced}${progressText(t.progressPct)} Pay with SOL; your wallet shows what you get before you sign.`.replace(/\s+/g, ' ').trim(),
    label: `Buy ${ticker}`,
    links: {
      actions: [
        ...BLINK_AMOUNTS.map((a) => ({ type: 'transaction' as const, label: `${a} SOL`, href: href(a) })),
        {
          type: 'transaction' as const,
          label: `Buy ${ticker}`,
          href: href('{amount}'),
          parameters: [{ type: 'number' as const, name: 'amount', label: `SOL amount (max ${MAX_BLINK_SOL})`, required: true, min: MIN_BLINK_SOL, max: MAX_BLINK_SOL }],
        },
      ],
    },
  } as ActionGetResponse;
}

export { BLOCKCHAIN_IDS };
