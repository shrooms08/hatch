// Server-only: the "sniper receipt" for a v2 pool, i.e. what its anti-sniper fee scheduler actually collected
// from buys in the shield window (activation .. activation + numberOfPeriod x periodFrequency, 60 s for Hatch).
// Real on-chain data only: every swap's fee comes from the DBC program's own swap event (emitted by self-CPI as
// an inner instruction), never from an estimate. Fees are paid in the quote token (all Hatch configs collect
// fees in the quote token), so a buy's fee = trading + protocol + referral fee = included - excluded input.
import BN from 'bn.js';
import bs58 from 'bs58';
import { Connection } from '@solana/web3.js';
import { DYNAMIC_BONDING_CURVE_PROGRAM_ID, createDbcProgram, getBaseFeeNumeratorByPeriod } from '@meteora-ag/dynamic-bonding-curve-sdk';
import type { FeeSchedule } from '@/lib/dbc/feeSchedule';
import { shieldDuration, shieldRange } from '@/lib/dbc/feeSchedule';

export type ShieldReceipt = {
  pool: string;
  quoteMint: string;
  quoteDecimals: number;
  /** Unix seconds; the window is [windowStart, windowEnd). */
  windowStart: number;
  windowEnd: number;
  /** Fee (%) at the start of the window and the base fee it falls to. */
  startFeePct: number;
  baseFeePct: number;
  /** Buys that landed in the window, and what they paid (raw quote units, as strings). */
  buys: number;
  feesRaw: string;
  /** The part of feesRaw a buy would have paid at the base fee anyway. */
  baseRaw: string;
  /** feesRaw - baseRaw: what the shield added. */
  taxRaw: string;
  /** Up to 10 in-window buy signatures, oldest first, so anyone can check the numbers on an explorer. */
  signatures: string[];
  /** True once the window is closed and settled: the receipt never changes after that. */
  final: boolean;
  computedAt: number;
};

/** One swap in the pool, from its swap event. */
export type PoolSwap = { signature: string; buy: boolean; timestamp: number; inputRaw: bigint; feeRaw: bigint };

const FEE_DENOMINATOR = BigInt(1_000_000_000);
/** Anchor's event-CPI instruction tag (sha256("anchor:event")[..8]) that prefixes every emitted event. */
const EVENT_IX_TAG = Buffer.from('e445a52e51cb9a1d', 'hex');
const DBC_ID = DYNAMIC_BONDING_CURVE_PROGRAM_ID.toBase58();
/** Signature block times vs the program clock: prefilter generously, then filter exactly on the event timestamp. */
const PREFILTER_SLACK_S = 15;
/** After the window closes, wait this long (finalization) before the receipt is written once and for all. */
export const SETTLE_S = 45;
const MAX_SIGNATURE_PAGES = 100;
const MAX_WINDOW_TXS = 1500;
const FETCH_CONCURRENCY = 8;
const EXAMPLE_SIGNATURES = 10;

/** The fee numerator the schedule ends at (the "base" fee), from the program's own math. */
export function baseFeeNumerator(f: FeeSchedule): bigint {
  const n = getBaseFeeNumeratorByPeriod(new BN(f.cliffFeeNumerator), f.numberOfPeriod, new BN(f.numberOfPeriod), new BN(f.reductionFactor), f.mode);
  return BigInt(n.toString());
}

type EventCoder = { decode(b64: string): { name: string; data: Record<string, unknown> } | null };
let coder: EventCoder | null = null;
/** Anchor event decoder for the DBC program (the URL is never called: decoding is local). */
export function eventCoder(url: string): EventCoder {
  coder ??= createDbcProgram(new Connection(url)).program.coder.events as unknown as EventCoder;
  return coder;
}

const big = (v: unknown) => BigInt((v as { toString(): string }).toString());

type RawTx = {
  transaction: { signatures: string[]; message: { accountKeys: string[] } };
  meta: { err: unknown; loadedAddresses?: { writable?: string[]; readonly?: string[] }; innerInstructions?: { instructions: { programIdIndex: number; data: string }[] }[] } | null;
};

/**
 * The pool's swaps in one transaction (raw getTransaction JSON). Each DBC swap emits both the legacy evtSwap
 * and evtSwap2; evtSwap2 is used when present, so a swap is counted once.
 */
export function swapsInTx(tx: RawTx, pool: string, coder: EventCoder): PoolSwap[] {
  if (!tx.meta || tx.meta.err) return [];
  const keys = [...tx.transaction.message.accountKeys, ...(tx.meta.loadedAddresses?.writable ?? []), ...(tx.meta.loadedAddresses?.readonly ?? [])];
  const v2: PoolSwap[] = [];
  const v1: PoolSwap[] = [];
  const signature = tx.transaction.signatures[0];
  for (const group of tx.meta.innerInstructions ?? [])
    for (const ix of group.instructions) {
      if (keys[ix.programIdIndex] !== DBC_ID) continue;
      const raw = Buffer.from(bs58.decode(ix.data));
      if (raw.length < 16 || !raw.subarray(0, 8).equals(EVENT_IX_TAG)) continue;
      let ev: ReturnType<EventCoder['decode']> = null;
      try {
        ev = coder.decode(raw.subarray(8).toString('base64'));
      } catch {
        continue;
      }
      if (!ev || (ev.name !== 'evtSwap2' && ev.name !== 'evtSwap')) continue;
      const d = ev.data as {
        pool: { toBase58(): string };
        tradeDirection: number;
        currentTimestamp: unknown;
        swapResult: { tradingFee: unknown; protocolFee: unknown; referralFee: unknown; includedFeeInputAmount?: unknown };
        params?: { amountIn: unknown };
      };
      if (d.pool.toBase58() !== pool) continue;
      const r = d.swapResult;
      const swap: PoolSwap = {
        signature,
        buy: d.tradeDirection === 1, // 1 = quote -> base
        timestamp: Number(big(d.currentTimestamp)),
        inputRaw: big(ev.name === 'evtSwap2' ? r.includedFeeInputAmount : d.params!.amountIn),
        feeRaw: big(r.tradingFee) + big(r.protocolFee) + big(r.referralFee),
      };
      (ev.name === 'evtSwap2' ? v2 : v1).push(swap);
    }
  return v2.length ? v2 : v1;
}

/** Buys in [start, end): count, total fees, the base-fee share of them and the excess (the shield's tax). */
export function summarizeShield(swaps: PoolSwap[], o: { start: number; end: number; baseFeeNumerator: bigint }) {
  const inWindow = swaps.filter((s) => s.buy && s.timestamp >= o.start && s.timestamp < o.end).sort((a, b) => a.timestamp - b.timestamp);
  let fees = BigInt(0);
  let base = BigInt(0);
  let tax = BigInt(0);
  for (const s of inWindow) {
    const atBase = (s.inputRaw * o.baseFeeNumerator) / FEE_DENOMINATOR;
    fees += s.feeRaw;
    base += atBase < s.feeRaw ? atBase : s.feeRaw;
    tax += s.feeRaw > atBase ? s.feeRaw - atBase : BigInt(0);
  }
  return {
    buys: inWindow.length,
    feesRaw: fees.toString(),
    baseRaw: base.toString(),
    taxRaw: tax.toString(),
    signatures: [...new Set(inWindow.map((s) => s.signature))].slice(0, EXAMPLE_SIGNATURES),
  };
}

async function rpc<T>(url: string, method: string, params: unknown[]): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    if (res.status === 429 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 300 + Math.random() * 400));
      continue;
    }
    if (!res.ok) throw new Error(`${method} failed (${res.status})`);
    const body = (await res.json()) as { result?: T; error?: { message?: string } };
    if (body.error) throw new Error(`${method} failed`);
    return body.result as T;
  }
}

type SigInfo = { signature: string; err: unknown; blockTime: number | null };

/** Successful signatures touching the pool with a block time near [start, end), newest-first pages walked back to start. */
async function windowSignatures(url: string, pool: string, start: number, end: number, commitment: string): Promise<string[]> {
  const out: string[] = [];
  let before: string | undefined;
  for (let page = 0; page < MAX_SIGNATURE_PAGES; page++) {
    const batch = await rpc<SigInfo[]>(url, 'getSignaturesForAddress', [pool, { limit: 1000, commitment, ...(before ? { before } : {}) }]);
    for (const s of batch) if (!s.err && s.blockTime != null && s.blockTime >= start - PREFILTER_SLACK_S && s.blockTime < end + PREFILTER_SLACK_S) out.push(s.signature);
    const last = batch[batch.length - 1];
    if (batch.length < 1000 || (last?.blockTime != null && last.blockTime < start - PREFILTER_SLACK_S)) return out;
    before = last.signature;
  }
  throw new Error('pool history too long to scan');
}

/** Reads the window's transactions and builds the receipt. `final` only when the window has closed and settled. */
export async function computeShieldReceipt(
  url: string,
  p: { pool: string; quoteMint: string; quoteDecimals: number; activationPoint: string; schedule: FeeSchedule },
  nowS = Date.now() / 1000
): Promise<ShieldReceipt> {
  const start = Number(p.activationPoint);
  const end = start + shieldDuration(p.schedule);
  const final = nowS >= end + SETTLE_S;
  const commitment = final ? 'finalized' : 'confirmed';
  const range = shieldRange(p.schedule);
  const sigs = nowS < start ? [] : await windowSignatures(url, p.pool, start, end, commitment);
  if (sigs.length > MAX_WINDOW_TXS) throw new Error('too many transactions in the window');
  const c = eventCoder(url);
  const swaps: PoolSwap[] = [];
  for (let i = 0; i < sigs.length; i += FETCH_CONCURRENCY) {
    const txs = await Promise.all(
      sigs.slice(i, i + FETCH_CONCURRENCY).map((sig) => rpc<RawTx | null>(url, 'getTransaction', [sig, { encoding: 'json', maxSupportedTransactionVersion: 1, commitment }]))
    );
    for (const tx of txs) {
      // A listed signature whose transaction cannot be read yet: never write a final receipt without it.
      if (!tx) throw new Error('transaction not available yet');
      swaps.push(...swapsInTx(tx, p.pool, c));
    }
  }
  return {
    pool: p.pool,
    quoteMint: p.quoteMint,
    quoteDecimals: p.quoteDecimals,
    windowStart: start,
    windowEnd: end,
    startFeePct: range.start,
    baseFeePct: range.end,
    ...summarizeShield(swaps, { start, end, baseFeeNumerator: baseFeeNumerator(p.schedule) }),
    final,
    computedAt: Math.floor(nowS),
  };
}
