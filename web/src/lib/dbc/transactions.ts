// Client-side transaction builders for trading and fee claims on DBC pools.
// Phantom (through the wallet adapter) signs AND sends; nothing is relayed by our server.
import { Connection, PublicKey, Transaction, VersionedTransaction, type Signer } from '@solana/web3.js';
import { SwapMode } from '@meteora-ag/dynamic-bonding-curve-sdk';
import type { WalletContextState } from '@jup-ag/wallet-adapter';
import BN from 'bn.js';
import { dbcClient } from '@/lib/dbc/pool';
import { fetchMintInfo, uiToRaw, type MintInfo } from '@/lib/solana/mint';
import { addPriorityFee } from '@/lib/solana/priorityFee';

export type TradeSide = 'buy' | 'sell';

export type TradeQuote = {
  amountInRaw: BN;
  outRaw: BN;
  minOutRaw: BN;
  inMint: MintInfo;
  outMint: MintInfo;
};

async function currentPoint(connection: Connection, activationType: number) {
  const slot = await connection.getSlot('confirmed');
  if (activationType === 0) return new BN(slot);
  const time = await connection.getBlockTime(slot);
  return new BN(time ?? Math.floor(Date.now() / 1000));
}

/** Quote + unsigned swap transaction. Buys spend the pool's quote token (SOL, NVDAx, ...). */
export async function buildSwap(params: {
  connection: Connection;
  owner: PublicKey;
  pool: string;
  side: TradeSide;
  amountUi: string;
  slippageBps: number;
}): Promise<{ tx: Transaction; quote: TradeQuote }> {
  const { connection, owner, side, amountUi, slippageBps } = params;
  const client = dbcClient(connection);
  const virtualPool = await client.state.getPool(params.pool);
  if (!virtualPool) throw new Error('Pool not found');
  const config = await client.state.getPoolConfig(virtualPool.poolState.config);
  if (!config) throw new Error('Pool config not found');
  if (virtualPool.poolState.isMigrated === 1) throw new Error('This token has hatched; the curve is closed.');

  const quoteMint = await fetchMintInfo(connection, config.quoteMint);
  const baseMint = await fetchMintInfo(connection, virtualPool.poolState.baseMint);
  const swapBaseForQuote = side === 'sell';
  const inMint = swapBaseForQuote ? baseMint : quoteMint;
  const outMint = swapBaseForQuote ? quoteMint : baseMint;
  const amountIn = uiToRaw(amountUi, inMint);
  if (amountIn.lten(0)) throw new Error('Enter an amount greater than zero');

  const quote = client.pool.swapQuote2({
    virtualPool,
    config,
    swapBaseForQuote,
    hasReferral: false,
    eligibleForFirstSwapWithMinFee: false,
    currentPoint: await currentPoint(connection, config.activationType),
    slippageBps,
    swapMode: SwapMode.ExactIn,
    amountIn,
  });
  const minOut = quote.minimumAmountOut!;
  // The SDK resolves token programs from the config (Token-2022 quotes included) and wraps/unwraps SOL.
  const tx = await client.pool.swap2({
    owner,
    pool: new PublicKey(params.pool),
    swapBaseForQuote,
    referralTokenAccount: null,
    swapMode: SwapMode.ExactIn,
    amountIn,
    minimumAmountOut: minOut,
  });
  return {
    tx: addPriorityFee(tx, 400_000),
    quote: { amountInRaw: amountIn, outRaw: quote.outputAmount, minOutRaw: minOut, inMint, outMint },
  };
}

/** Claim all of the creator's unclaimed curve trading fees (quote + base). */
export async function buildClaimCreatorFees(params: {
  connection: Connection;
  creator: PublicKey;
  pool: string;
}): Promise<Transaction> {
  const client = dbcClient(params.connection);
  const pool = await client.state.getPool(params.pool);
  if (!pool) throw new Error('Pool not found');
  if (!pool.poolState.creator.equals(params.creator)) throw new Error('Only the pool creator can claim');
  const { creatorBaseFee, creatorQuoteFee } = pool.poolState;
  if (creatorBaseFee.isZero() && creatorQuoteFee.isZero()) throw new Error('No creator fees to claim yet');
  const tx = await client.creator.claimCreatorTradingFee({
    creator: params.creator,
    payer: params.creator,
    pool: new PublicKey(params.pool),
    maxBaseAmount: creatorBaseFee,
    maxQuoteAmount: creatorQuoteFee,
  });
  return addPriorityFee(tx, 300_000);
}

/**
 * Has the connected wallet sign and send `tx` (Phantom signAndSend), with optional extra
 * local signers (e.g. a fresh mint keypair). Simulates first so errors surface before the popup.
 */
export async function signAndSend(
  wallet: Pick<WalletContextState, 'publicKey' | 'sendTransaction'>,
  connection: Connection,
  tx: Transaction,
  signers: Signer[] = []
): Promise<string> {
  if (!wallet.publicKey) throw new Error('Connect your wallet first');
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.feePayer = wallet.publicKey;
  tx.recentBlockhash = blockhash;

  const sim = await connection.simulateTransaction(tx);
  if (sim.value.err) {
    const logs = sim.value.logs?.slice(-6).join('\n') ?? '';
    throw new Error(`Simulation failed: ${JSON.stringify(sim.value.err)}${logs ? `\n${logs}` : ''}`);
  }

  const signature = await wallet.sendTransaction(tx, connection, { signers });
  const res = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
  if (res.value.err) throw new Error(`Transaction failed: ${JSON.stringify(res.value.err)}`);
  return signature;
}

/**
 * Versioned-transaction variant (e.g. Jupiter + DBC in one v0 tx with lookup tables): refresh the
 * blockhash, simulate, then the wallet signs and sends.
 */
export async function signAndSendVersioned(
  wallet: Pick<WalletContextState, 'publicKey' | 'sendTransaction'>,
  connection: Connection,
  tx: VersionedTransaction
): Promise<string> {
  if (!wallet.publicKey) throw new Error('Connect your wallet first');
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  tx.message.recentBlockhash = blockhash;
  const sim = await connection.simulateTransaction(tx, { sigVerify: false });
  if (sim.value.err) {
    const logs = sim.value.logs?.slice(-6).join('\n') ?? '';
    throw new Error(`Simulation failed: ${JSON.stringify(sim.value.err)}${logs ? `\n${logs}` : ''}`);
  }
  const signature = await wallet.sendTransaction(tx, connection);
  const res = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, 'confirmed');
  if (res.value.err) throw new Error(`Transaction failed: ${JSON.stringify(res.value.err)}`);
  return signature;
}
