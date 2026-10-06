// "Pay with SOL" for pools quoted in another token (e.g. NVDAx): Jupiter SOL -> quote token, then the
// DBC buy, protected on both legs. Prefers ONE v0 transaction (Jupiter instructions + DBC swap, with
// Jupiter's address lookup tables) so the user signs once; falls back to two transactions.
import BN from 'bn.js';
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type TransactionInstruction,
} from '@solana/web3.js';
import { SwapMode } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { dbcClient } from '@/lib/dbc/pool';
import { fetchMintInfo, fetchRawBalance, type MintInfo } from '@/lib/solana/mint';
import { PRIORITY_FEE_MICROLAMPORTS } from '@/lib/config/network';
import { WSOL, jupQuote, jupSwapInstructions, jupSwapTransaction, type JupQuote } from '@/lib/jupiter';

const TX_SIZE_LIMIT = 1232;

export type PayWithSolQuote = {
  pool: string;
  lamportsIn: bigint;
  jup: JupQuote;
  quoteMint: MintInfo;
  baseMint: MintInfo;
  /** Leg 1: quote-token out (expected / guaranteed minimum). */
  quoteOutRaw: BN;
  quoteMinRaw: BN;
  /** Leg 2: tokens out, estimated from the expected leg-1 output; minimum from the guaranteed leg-1 minimum. */
  baseOutRaw: BN;
  baseMinRaw: BN;
};

async function currentPoint(connection: Connection, activationType: number) {
  const slot = await connection.getSlot('confirmed');
  if (activationType === 0) return new BN(slot);
  return new BN((await connection.getBlockTime(slot)) ?? Math.floor(Date.now() / 1000));
}

async function poolAndConfig(connection: Connection, pool: string) {
  const client = dbcClient(connection);
  const virtualPool = await client.state.getPool(pool);
  if (!virtualPool) throw new Error('Pool not found');
  const config = await client.state.getPoolConfig(virtualPool.poolState.config);
  if (!config) throw new Error('Pool config not found');
  if (virtualPool.poolState.isMigrated === 1) throw new Error('This token has hatched; the curve is closed.');
  return { client, virtualPool, config };
}

export async function quotePayWithSol(params: { connection: Connection; pool: string; solUi: string; slippageBps: number }): Promise<PayWithSolQuote> {
  const { connection, slippageBps } = params;
  const lamportsIn = BigInt(Math.floor(Number(params.solUi) * 1e9));
  if (!(lamportsIn > BigInt(0))) throw new Error('Enter an amount greater than zero');
  const { client, virtualPool, config } = await poolAndConfig(connection, params.pool);
  const [quoteMint, baseMint] = await Promise.all([fetchMintInfo(connection, config.quoteMint), fetchMintInfo(connection, virtualPool.poolState.baseMint)]);
  const jup = await jupQuote(WSOL, config.quoteMint, lamportsIn, slippageBps);
  const quoteOutRaw = new BN(jup.outAmount);
  const quoteMinRaw = new BN(jup.otherAmountThreshold);
  const point = await currentPoint(connection, config.activationType);
  const dbcQuote = (amountIn: BN) =>
    client.pool.swapQuote2({ virtualPool, config, swapBaseForQuote: false, hasReferral: false, eligibleForFirstSwapWithMinFee: false, currentPoint: point, slippageBps, swapMode: SwapMode.ExactIn, amountIn });
  const expected = dbcQuote(quoteOutRaw);
  const guaranteed = dbcQuote(quoteMinRaw);
  return { pool: params.pool, lamportsIn, jup, quoteMint, baseMint, quoteOutRaw, quoteMinRaw, baseOutRaw: expected.outputAmount, baseMinRaw: guaranteed.minimumAmountOut! };
}

const withoutComputeBudget = (ixs: TransactionInstruction[]) => ixs.filter((ix) => !ix.programId.equals(ComputeBudgetProgram.programId));

/** DBC buy spending exactly `amountIn` of the quote token, with `minOut` protection. */
async function dbcBuyInstructions(connection: Connection, owner: PublicKey, pool: string, amountIn: BN, minOut: BN) {
  const tx = await dbcClient(connection).pool.swap2({ owner, pool: new PublicKey(pool), swapBaseForQuote: false, referralTokenAccount: null, swapMode: SwapMode.ExactIn, amountIn, minimumAmountOut: minOut });
  return withoutComputeBudget(tx.instructions);
}

export type PayWithSolPlan =
  | { kind: 'single'; tx: VersionedTransaction }
  | { kind: 'two-step'; step1: VersionedTransaction; step2: () => Promise<VersionedTransaction> };

/**
 * Leg 2 spends the GUARANTEED leg-1 minimum (so it can never exceed what arrives) and requires at
 * least baseMinRaw tokens. Any extra quote token from leg 1 stays in the user's wallet.
 */
export async function buildPayWithSol(connection: Connection, owner: PublicKey, q: PayWithSolQuote): Promise<PayWithSolPlan> {
  const jup = await jupSwapInstructions(q.jup, owner);
  const dbcIxs = await dbcBuyInstructions(connection, owner, q.pool, q.quoteMinRaw, q.baseMinRaw);
  const ixs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: jup.computeUnitLimit + 250_000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_FEE_MICROLAMPORTS }),
    ...withoutComputeBudget(jup.setup),
    ...jup.other,
    jup.swap,
    ...dbcIxs,
    ...jup.cleanup,
  ];
  const tables = (await Promise.all(jup.lookupTables.map((t) => connection.getAddressLookupTable(t)))).map((r) => r.value).filter((v): v is AddressLookupTableAccount => !!v);
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  try {
    const msg = new TransactionMessage({ payerKey: owner, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message(tables);
    const tx = new VersionedTransaction(msg);
    if (tx.serialize().length <= TX_SIZE_LIMIT) return { kind: 'single', tx };
  } catch {
    /* too large to encode: fall through to two transactions */
  }

  // Fallback: (1) Jupiter swap tx, then (2) the DBC buy with what actually arrived.
  const step1 = await jupSwapTransaction(q.jup, owner, PRIORITY_FEE_MICROLAMPORTS);
  const before = await fetchRawBalance(connection, owner, q.quoteMint);
  return {
    kind: 'two-step',
    step1,
    step2: async () => {
      const after = await fetchRawBalance(connection, owner, q.quoteMint);
      const received = after.sub(before);
      if (received.lte(new BN(0))) throw new Error('The SOL swap did not deliver any tokens; nothing was bought.');
      const fresh = await quotePayWithSolFromQuoteAmount(connection, q.pool, received, q.jup.slippageBps);
      const ixs2 = await dbcBuyInstructions(connection, owner, q.pool, received, fresh);
      const { blockhash: bh } = await connection.getLatestBlockhash('confirmed');
      const m = new TransactionMessage({
        payerKey: owner,
        recentBlockhash: bh,
        instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 300_000 }), ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_FEE_MICROLAMPORTS }), ...ixs2],
      }).compileToV0Message();
      return new VersionedTransaction(m);
    },
  };
}

/** Minimum tokens out for spending `amountIn` of the quote token right now. */
async function quotePayWithSolFromQuoteAmount(connection: Connection, pool: string, amountIn: BN, slippageBps: number): Promise<BN> {
  const { client, virtualPool, config } = await poolAndConfig(connection, pool);
  const point = await currentPoint(connection, config.activationType);
  return client.pool.swapQuote2({ virtualPool, config, swapBaseForQuote: false, hasReferral: false, eligibleForFirstSwapWithMinFee: false, currentPoint: point, slippageBps, swapMode: SwapMode.ExactIn, amountIn }).minimumAmountOut!;
}
