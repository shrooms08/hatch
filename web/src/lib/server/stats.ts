// Server-only: Home "live stats" (tokens hatched, unique wallets, volume in USD) plus each pool's
// creation time, computed from chain for pools under Hatch's configs (HIDDEN_MINTS excluded).
//
// How volume is measured: there is no indexer, so for every pool we read its transaction history
// (getSignaturesForAddress on the pool account, incrementally) and, per successful transaction,
// take the absolute change of the pool's quote-token vault (owned by the DBC pool authority) from
// the transaction's pre/post token balances. That is the quote-token amount that traded. It is
// converted to USD with Jupiter's price API (lite-api /price/v3) for each quote mint (SOL, NVDAx,
// ...), at the current price. Unique wallets are the distinct fee payers of those transactions.
// Results are cached in memory for 60 seconds (and on the CDN via Cache-Control).
import { Connection, PublicKey } from '@solana/web3.js';
import { deriveDbcPoolAuthority } from '@meteora-ag/dynamic-bonding-curve-sdk';
import Decimal from 'decimal.js';
import BN from 'bn.js';
import { serverRpcUrl } from '@/lib/config/network';
import { fetchHatchPools, type HatchPool } from '@/lib/dbc/pool';
import { rawToUi } from '@/lib/solana/mint';
import { loadHatchConfigs } from '@/lib/server/presets';

export type HatchStats = {
  network: string;
  tokens: number;
  wallets: number;
  /** null when no USD price was available for some traded quote token. */
  volumeUsd: number | null;
  volumeByQuote: Record<string, { symbol: string; amount: string; usdPrice: number | null }>;
  /** pool address -> unix seconds of its first transaction. */
  createdAt: Record<string, number>;
  updatedAt: number;
};

const TTL_MS = 60_000;
const MAX_SIGS_PER_REFRESH = 1000;
const POOL_AUTHORITY = deriveDbcPoolAuthority().toBase58();
const JUP_PRICE = `${process.env.NEXT_PUBLIC_JUPITER_API_URL || 'https://lite-api.jup.ag'}/price/v3`;

type PoolTally = { newest?: string; createdAt?: number; volumeRaw: BN; wallets: Set<string> };
const tallies = new Map<string, PoolTally>();
let cached: { at: number; value: HatchStats } | null = null;
let inflight: Promise<HatchStats> | null = null;

type TokenBalance = { mint: string; owner?: string; uiTokenAmount: { amount: string } };
type RawTx = {
  meta: { err: unknown; preTokenBalances?: TokenBalance[]; postTokenBalances?: TokenBalance[] } | null;
  transaction: { message: { accountKeys: ({ pubkey: string } | string)[] } };
};

function quoteVaultDelta(tx: RawTx, quoteMint: string): BN {
  const meta = tx.meta;
  if (!meta || meta.err) return new BN(0);
  const amount = (list?: TokenBalance[]) => new BN(list?.find((b) => b.mint === quoteMint && b.owner === POOL_AUTHORITY)?.uiTokenAmount.amount ?? '0');
  return amount(meta.postTokenBalances).sub(amount(meta.preTokenBalances)).abs();
}

/**
 * getTransaction as a raw JSON-RPC batch: web3.js v1 cannot decode newer transaction versions, and
 * only token balances and the fee payer are needed here.
 */
async function fetchTransactions(signatures: string[]): Promise<(RawTx | null)[]> {
  const body = signatures.map((sig, id) => ({
    jsonrpc: '2.0',
    id,
    method: 'getTransaction',
    params: [sig, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 1 }],
  }));
  const res = await fetch(serverRpcUrl(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
  const out = (await res.json()) as { id: number; result?: RawTx | null }[];
  const byId = new Map(out.map((r) => [r.id, r.result ?? null]));
  return signatures.map((_, i) => byId.get(i) ?? null);
}

const feePayer = (tx: RawTx) => {
  const k = tx.transaction.message.accountKeys[0];
  return typeof k === 'string' ? k : k?.pubkey;
};

/** New signatures for `pool` since the last refresh (newest first), capped per refresh. */
async function newSignatures(connection: Connection, pool: PublicKey, until?: string) {
  const out: { signature: string; blockTime?: number | null; err: unknown }[] = [];
  let before: string | undefined;
  while (out.length < MAX_SIGS_PER_REFRESH) {
    const page = await connection.getSignaturesForAddress(pool, { before, until, limit: 1000 }, 'confirmed');
    out.push(...page);
    if (page.length < 1000) break;
    before = page[page.length - 1].signature;
  }
  return out;
}

async function tallyPool(connection: Connection, pool: HatchPool) {
  const t = tallies.get(pool.address) ?? { volumeRaw: new BN(0), wallets: new Set<string>() };
  const sigs = await newSignatures(connection, new PublicKey(pool.address), t.newest);
  if (sigs.length) {
    const oldest = sigs[sigs.length - 1];
    if (!t.newest && oldest.blockTime) t.createdAt = oldest.blockTime;
    const ok = sigs.filter((s) => !s.err).map((s) => s.signature);
    for (let i = 0; i < ok.length; i += 50) {
      const txs = await fetchTransactions(ok.slice(i, i + 50));
      for (const tx of txs) {
        if (!tx) continue;
        t.volumeRaw = t.volumeRaw.add(quoteVaultDelta(tx, pool.quote.address));
        const payer = feePayer(tx);
        if (payer) t.wallets.add(payer);
      }
    }
    t.newest = sigs[0].signature;
  }
  tallies.set(pool.address, t);
  return t;
}

async function usdPrices(mints: string[]): Promise<Record<string, number>> {
  if (!mints.length) return {};
  try {
    const res = await fetch(`${JUP_PRICE}?ids=${mints.join(',')}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return {};
    const body = (await res.json()) as Record<string, { usdPrice?: number } | null>;
    return Object.fromEntries(Object.entries(body).flatMap(([m, v]) => (v?.usdPrice ? [[m, v.usdPrice]] : [])));
  } catch {
    return {};
  }
}

async function compute(): Promise<HatchStats> {
  const hc = loadHatchConfigs();
  const connection = new Connection(serverRpcUrl(), 'confirmed');
  const pools = await fetchHatchPools(connection, hc, { publicList: true });

  const wallets = new Set<string>();
  const byQuote = new Map<string, { pool: HatchPool; raw: BN }>();
  const createdAt: Record<string, number> = {};
  for (const pool of pools) {
    const t = await tallyPool(connection, pool);
    t.wallets.forEach((w) => wallets.add(w));
    if (t.createdAt) createdAt[pool.address] = t.createdAt;
    const q = byQuote.get(pool.quote.address) ?? { pool, raw: new BN(0) };
    q.raw = q.raw.add(t.volumeRaw);
    byQuote.set(pool.quote.address, q);
  }

  const prices = await usdPrices([...byQuote.keys()]);
  let usd = new Decimal(0);
  let complete = true;
  const volumeByQuote: HatchStats['volumeByQuote'] = {};
  for (const [mint, { pool, raw }] of byQuote) {
    const amount = rawToUi(raw, pool.quote);
    const price = prices[mint] ?? null;
    if (price === null && !raw.isZero()) complete = false;
    if (price !== null) usd = usd.add(amount.mul(price));
    volumeByQuote[mint] = { symbol: pool.quote.isNativeSol ? 'SOL' : mint.slice(0, 4), amount: amount.toFixed(), usdPrice: price };
  }

  return {
    network: hc.network,
    tokens: pools.length,
    wallets: wallets.size,
    volumeUsd: complete ? usd.toNumber() : null,
    volumeByQuote,
    createdAt,
    updatedAt: Date.now(),
  };
}

export async function getHatchStats(): Promise<HatchStats> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  inflight ??= compute()
    .then((value) => {
      cached = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
