// Jupiter Swap API (free lite-api; browser CORS allowed). Mainnet only: Jupiter has no devnet.
import { PublicKey, TransactionInstruction, VersionedTransaction } from '@solana/web3.js';

const JUP = process.env.NEXT_PUBLIC_JUPITER_API_URL || 'https://lite-api.jup.ag';
export const WSOL = new PublicKey('So11111111111111111111111111111111111111112');

export class JupiterBusyError extends Error {
  constructor() {
    super('Jupiter is busy right now (rate limited). Try again in a few seconds.');
  }
}

export type JupQuote = {
  inAmount: string;
  outAmount: string;
  /** Minimum out after slippage (ExactIn). */
  otherAmountThreshold: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: { swapInfo: { label: string } }[];
  [k: string]: unknown;
};

async function jupFetch(path: string, init?: RequestInit) {
  let res: Response;
  try {
    res = await fetch(`${JUP}${path}`, { ...init, signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new Error('Could not reach Jupiter. Check your connection and try again.');
  }
  if (res.status === 429) throw new JupiterBusyError();
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) throw new Error(`Jupiter: ${body?.error ?? `HTTP ${res.status}`}`);
  return body;
}

/** ExactIn quote. Prefers a direct route (fewer accounts, so the combined tx fits; no leftover intermediate token account). */
export async function jupQuote(inputMint: PublicKey, outputMint: PublicKey, amount: bigint, slippageBps: number): Promise<JupQuote> {
  const base = `/swap/v1/quote?inputMint=${inputMint.toBase58()}&outputMint=${outputMint.toBase58()}&amount=${amount}&slippageBps=${slippageBps}&restrictIntermediateTokens=true`;
  try {
    return (await jupFetch(`${base}&onlyDirectRoutes=true`)) as JupQuote;
  } catch (e) {
    if (e instanceof JupiterBusyError) throw e;
    return (await jupFetch(`${base}&maxAccounts=24`)) as JupQuote;
  }
}

type RawIx = { programId: string; accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[]; data: string };
const toIx = (ix: RawIx) =>
  new TransactionInstruction({
    programId: new PublicKey(ix.programId),
    keys: ix.accounts.map((a) => ({ pubkey: new PublicKey(a.pubkey), isSigner: a.isSigner, isWritable: a.isWritable })),
    data: Buffer.from(ix.data, 'base64'),
  });

export type JupSwapInstructions = {
  setup: TransactionInstruction[];
  swap: TransactionInstruction;
  cleanup: TransactionInstruction[];
  other: TransactionInstruction[];
  lookupTables: PublicKey[];
  computeUnitLimit: number;
};

/** The swap as instructions, so it can share one transaction with the DBC buy. */
export async function jupSwapInstructions(quote: JupQuote, user: PublicKey): Promise<JupSwapInstructions> {
  const d = await jupFetch('/swap/v1/swap-instructions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ quoteResponse: quote, userPublicKey: user.toBase58(), wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true }),
  });
  return {
    setup: (d.setupInstructions ?? []).map(toIx),
    swap: toIx(d.swapInstruction),
    cleanup: d.cleanupInstruction ? [toIx(d.cleanupInstruction)] : [],
    other: (d.otherInstructions ?? []).map(toIx),
    lookupTables: (d.addressLookupTableAddresses ?? []).map((a: string) => new PublicKey(a)),
    computeUnitLimit: Number(d.computeUnitLimit ?? 200_000),
  };
}

/** A ready-to-sign swap transaction (used by the two-step fallback). */
export async function jupSwapTransaction(quote: JupQuote, user: PublicKey, computeUnitPriceMicroLamports: number): Promise<VersionedTransaction> {
  const d = await jupFetch('/swap/v1/swap', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ quoteResponse: quote, userPublicKey: user.toBase58(), wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, computeUnitPriceMicroLamports }),
  });
  return VersionedTransaction.deserialize(Buffer.from(d.swapTransaction, 'base64'));
}
