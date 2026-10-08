// GET /api/holdings?wallet=<address>: the Hatch tokens (current and legacy configs) this wallet holds,
// read from chain (SPL and Token-2022 accounts), with value in the quote token and a USD estimate
// (Jupiter prices). Cached 30 s per wallet.
import type { NextApiRequest, NextApiResponse } from 'next';
import Decimal from 'decimal.js';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { NETWORK, serverRpcUrl } from '@/lib/config/network';
import { STATUS_LABEL, fetchHatchPools, type HatchPool } from '@/lib/dbc/pool';
import { formatAmount } from '@/lib/format/amount';
import { stockForConfig } from '@/lib/presets';
import { loadHatchConfigs } from '@/lib/server/presets';
import { holdingsFrom, type WalletTokenAccount } from '@/lib/server/holdings';
import { tokenMeta } from '@/lib/server/tokenMeta';
import { usdPrices } from '@/lib/server/stats';
import { handleCors } from '@/lib/server/cors';
import { rateLimited } from '@/lib/server/rateLimit';

export type Holding = {
  mint: string;
  name: string;
  symbol: string;
  image: string | null;
  preset: string;
  quoteSymbol: string;
  balance: string;
  valueQuote: string;
  /** Estimate from Jupiter's price of the quote token; null when unavailable. */
  valueUsd: number | null;
  progressPct: number;
  status: string;
  statusId: HatchPool['status'];
  hatched: boolean;
  test: boolean;
  /** Token page with the Sell tab open. */
  tokenUrl: string;
};
export type HoldingsResponse = { wallet: string; network: string; holdings: Holding[] };

const POOLS_TTL = 60_000;
let poolsCache: { at: number; pools: Promise<HatchPool[]> } | null = null;
const walletCache = new Map<string, { at: number; body: HoldingsResponse }>();

function allPools(connection: Connection): Promise<HatchPool[]> {
  if (poolsCache && Date.now() - poolsCache.at < POOLS_TTL) return poolsCache.pools;
  const pools = fetchHatchPools(connection, loadHatchConfigs()).catch((e) => {
    poolsCache = null;
    throw e;
  });
  poolsCache = { at: Date.now(), pools };
  return pools;
}

async function walletAccounts(connection: Connection, owner: PublicKey): Promise<WalletTokenAccount[]> {
  const lists = await Promise.all(
    [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID].map((programId) => connection.getParsedTokenAccountsByOwner(owner, { programId }, 'confirmed'))
  );
  return lists.flatMap((l) =>
    l.value.map(({ account }) => {
      const info = (account.data as { parsed: { info: { mint: string; tokenAmount: { amount: string; decimals: number } } } }).parsed.info;
      return { mint: info.mint, amountRaw: info.tokenAmount.amount, decimals: info.tokenAmount.decimals };
    })
  );
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<HoldingsResponse | { error: string }>) {
  if (handleCors(req, res, ['GET'])) return;
  let owner: PublicKey;
  try {
    owner = new PublicKey(String(req.query.wallet ?? ''));
  } catch {
    return res.status(400).json({ error: 'wallet is not a valid address' });
  }
  const key = owner.toBase58();
  const hit = walletCache.get(key);
  if (hit && Date.now() - hit.at < 30_000) return res.status(200).json(hit.body);
  if (rateLimited(req, res, 'holdings', 240)) return;
  try {
    const connection = new Connection(serverRpcUrl(), 'confirmed');
    const hc = loadHatchConfigs();
    const [pools, accounts] = await Promise.all([allPools(connection), walletAccounts(connection, owner)]);
    const held = holdingsFrom(accounts, new Map(pools.map((p) => [p.baseMint, p])));
    const prices = await usdPrices([...new Set(held.map((h) => h.pool.quote.address))]);
    const holdings = await Promise.all(
      held.map(async ({ mint, amountRaw, decimals, pool }): Promise<Holding> => {
        const meta = await tokenMeta(connection, mint).catch((): null => null);
        const balance = new Decimal(amountRaw.toString()).div(new Decimal(10).pow(decimals));
        const valueQuote = balance.mul(pool.price);
        const usd = prices[pool.quote.address];
        return {
          mint,
          name: meta?.name || 'Unknown token',
          symbol: meta?.symbol || '',
          image: meta?.image ?? null,
          preset: pool.presetId!,
          quoteSymbol: pool.quote.isNativeSol ? 'SOL' : stockForConfig(hc, pool.configKey)?.symbol ?? pool.quote.address.slice(0, 4),
          balance: formatAmount(balance),
          valueQuote: formatAmount(valueQuote),
          valueUsd: usd ? valueQuote.mul(usd).toNumber() : null,
          progressPct: Math.round(pool.progress * 10_000) / 100,
          status: STATUS_LABEL[pool.status],
          statusId: pool.status,
          hatched: pool.isMigrated,
          test: hc.testMints.includes(mint),
          tokenUrl: `/token/${mint}?tab=sell`,
        };
      })
    );
    holdings.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));
    const body: HoldingsResponse = { wallet: key, network: NETWORK, holdings };
    walletCache.set(key, { at: Date.now(), body });
    if (walletCache.size > 5000) walletCache.clear();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(body);
  } catch (e) {
    console.error('holdings failed:', e instanceof Error ? e.message : e);
    return res.status(502).json({ error: 'Could not read holdings right now' });
  }
}
