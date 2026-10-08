// One place that turns any wallet, simulation, RPC, Jupiter or program error into a short plain-English
// message. Raw errors stay available as `details` (shown behind "Show details" and logged to the console).
import { formatSol, formatSolNeed } from '@/lib/costs';

/** Where a transaction failed. Decides whether "Nothing was charged" is true. */
export type TxStage =
  | 'prepare' // building, quoting, uploading: nothing sent
  | 'simulate' // simulation failed: nothing sent
  | 'wallet' // the wallet refused or errored while signing/sending
  | 'onchain' // landed and failed: only the network fee was paid
  | 'expired' // blockhash expired before it landed: nothing charged
  | 'pending'; // sent, outcome unknown

/** A failed transaction step, with what we know about it (thrown by lib/dbc/transactions). */
export class TxError extends Error {
  constructor(
    message: string,
    readonly stage: TxStage,
    readonly extra: { logs?: string[]; err?: unknown; signature?: string; cause?: unknown } = {}
  ) {
    super(message);
    this.name = 'TxError';
  }
}

/** A message already written for people (validation, "Enter an amount"): shown as is. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

export type TxErrorKind =
  | 'user'
  | 'cancelled'
  | 'insufficient-sol'
  | 'insufficient-token'
  | 'slippage'
  | 'expired'
  | 'busy'
  | 'paused'
  | 'unknown';

export type FriendlyError = { kind: TxErrorKind; message: string; details: string };

export type ErrorContext = {
  /** Wallet SOL balance in lamports, when known. */
  balanceLamports?: number | null;
  /** Our estimate of what this transaction needs, in lamports (lib/costs). */
  neededLamports?: number | null;
  /** Token the user is paying with (for "Not enough <SYMBOL>"). */
  symbol?: string;
  /** Extra plain sentence to append (e.g. Pay with SOL step 2: where the swapped tokens are). */
  note?: string;
};

/** Extra SOL on top of the estimate so a retry has room for fees that moved. */
export const SOL_BUFFER_LAMPORTS = 1_000_000; // 0.001 SOL

const stringify = (v: unknown) => {
  try {
    return JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x));
  } catch {
    return String(v);
  }
};

function stageOf(e: unknown): TxStage {
  if (e instanceof TxError) return e.stage;
  const name = (e as { name?: string } | null)?.name ?? '';
  if (/^Wallet/.test(name)) return 'wallet';
  return 'prepare';
}

/** The error and everything it wraps (wallet adapters nest the real error in `.error`; ours in `extra.cause`). */
function chainOf(e: unknown): unknown[] {
  const out: unknown[] = [];
  let cur: unknown = e;
  while (cur && out.length < 6 && !out.includes(cur)) {
    out.push(cur);
    const c = cur as { extra?: { cause?: unknown }; error?: unknown; cause?: unknown };
    cur = c.extra?.cause ?? (c.error instanceof Error || (c.error && typeof c.error === 'object' && 'message' in (c.error as object)) ? c.error : undefined) ?? c.cause;
  }
  return out;
}

const describe = (x: unknown) => {
  const v = x as { name?: string; message?: string; code?: unknown };
  if (x && typeof x === 'object' && ('message' in v || 'name' in v)) return `${v.name ?? 'Error'}: ${v.message ?? ''}${v.code !== undefined ? ` (code ${String(v.code)})` : ''}`;
  return stringify(x);
};

/** Everything we know about the error, for "Show details" (never the main message). */
export function errorDetails(e: unknown): string {
  const lines: string[] = [];
  const [first, ...causes] = chainOf(e);
  lines.push(describe(first));
  const err = first as { stage?: string; extra?: TxError['extra']; logs?: string[] } | null;
  if (err && typeof err === 'object') {
    if (err.stage) lines.push(`stage: ${err.stage}`);
    const x = err.extra;
    if (x?.signature) lines.push(`signature: ${x.signature}`);
    if (x?.err !== undefined && !(x.err instanceof Error)) lines.push(`error: ${stringify(x.err)}`);
    const logs = x?.logs ?? err.logs;
    if (logs?.length) lines.push('logs:', ...logs);
  }
  for (const c of causes) lines.push(`cause: ${describe(c)}`);
  return lines.join('\n');
}

/** All text an error carries (messages down the chain, logs, JSON, codes), lower-cased, for matching. */
function haystack(_e: unknown, details: string): string {
  return details.toLowerCase();
}

const hasCode = (e: unknown, code: number) => chainOf(e).some((x) => (x as { code?: unknown })?.code === code);

/** Custom program error code from {"InstructionError":[i,{"Custom":n}]}, if any. */
function customCode(e: unknown): number | null {
  const err = e instanceof TxError ? e.extra.err : null;
  const custom = (err as { InstructionError?: [number, { Custom?: number }] } | null)?.InstructionError?.[1]?.Custom;
  return typeof custom === 'number' ? custom : null;
}

export function friendlyTxError(e: unknown, ctx: ErrorContext = {}): FriendlyError {
  const details = errorDetails(e);
  const text = haystack(e, details);
  const stage = stageOf(e);
  const finish = (kind: TxErrorKind, message: string): FriendlyError => ({ kind, message: ctx.note ? `${message} ${ctx.note}` : message, details });

  if (e instanceof UserError) return finish('user', e.message);

  // Cancelled in the wallet.
  if (/user rejected|rejected the request|user denied|user cancel|request was cancelled|transaction cancelled|declined/.test(text) || hasCode(e, 4001))
    return finish('cancelled', 'You cancelled in your wallet. Nothing was sent.');

  // Not enough SOL (fees, rent, or the SOL being spent).
  const lamports = /insufficient lamports (\d+), need (\d+)/.exec(text);
  if (
    lamports ||
    /insufficientfundsforrent|insufficient funds for rent|insufficientfundsforfee|insufficient funds for fee|no record of a prior credit|accountnotfound/.test(text)
  ) {
    const have = ctx.balanceLamports ?? (lamports ? Number(lamports[1]) : null);
    const shortfall = lamports ? Number(lamports[2]) - Number(lamports[1]) : 0;
    const base = Math.max(ctx.neededLamports ?? 0, have != null ? have + shortfall + 5_000 : 0);
    if (base > 0 && have != null)
      return finish('insufficient-sol', `You need about ${formatSolNeed(base + SOL_BUFFER_LAMPORTS)} SOL for this. You have ${formatSol(have)}. Add SOL and try again.`);
    return finish('insufficient-sol', 'You need more SOL for this. Add SOL and try again.');
  }

  // Frozen account or a paused Token-2022 mint (xStocks can be paused by their issuer).
  if (/account is frozen|accountfrozen|is paused|mintpaused|paused on this mint/.test(text))
    return finish('paused', 'Trading in this stock token is paused by its issuer right now.');

  // Not enough of the token being spent (SPL Token "insufficient funds").
  if (/error: insufficient funds|insufficientfunds\b|insufficient token/.test(text))
    return finish('insufficient-token', `Not enough ${ctx.symbol ?? 'tokens'} in your wallet.`);

  // Slippage: DBC ExceededSlippage (6002), Jupiter SlippageToleranceExceeded (6001), or the words.
  const code = customCode(e);
  if (/exceededslippage|slippagetoleranceexceeded|slippage|minimum amount out|amount out is less than/.test(text) || (stage === 'onchain' && (code === 6001 || code === 6002)))
    return finish('slippage', 'The price moved before your trade landed. Try again, or raise slippage.');

  // Expired blockhash / not confirmed in time.
  if (stage === 'expired' || /blockhash not found|blockhashnotfound|block height exceeded|blockheightexceeded|has expired|expired before it confirmed/.test(text))
    return finish('expired', 'The network was slow and the transaction expired. Nothing was charged. Try again.');

  // Rate limits and network trouble (RPC 429, Jupiter busy, fetch failures).
  if (/\b(429|502|503) (too many|bad gateway|service)|too many requests|rate limit|jupiterbusyerror|jupiter is busy|failed to fetch|networkerror|network error|fetch failed|could not reach|econnreset|etimedout|service unavailable/.test(text) || e instanceof Error && e.name === 'JupiterBusyError')
    return finish('busy', 'The network is busy right now. Try again in a moment.');

  if (stage === 'pending') return finish('unknown', "We couldn't confirm the transaction yet. Check your wallet for details.");
  const charged = stage === 'wallet' ? 'Check your wallet for details.' : 'Nothing was charged.';
  return finish('unknown', `Something went wrong. ${charged}`);
}

/** Map + log: every UI failure goes through here so the raw error always reaches the console. */
export function reportTxError(e: unknown, ctx: ErrorContext = {}, where = 'transaction'): FriendlyError {
  console.error(`[hatch] ${where} failed:`, e);
  return friendlyTxError(e, ctx);
}
