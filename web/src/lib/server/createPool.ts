// Server-only: build the unsigned DBC createPool transaction for a launch.
// The user's wallet is payer + creator; the browser adds the base-mint keypair signature,
// and Phantom signs and sends. The server never sends anything.
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { DynamicBondingCurveClient, deriveDbcPoolAddress, deriveTokenBadgeAddress } from '@meteora-ag/dynamic-bonding-curve-sdk';
import { addPriorityFee } from '@/lib/solana/priorityFee';

export async function buildCreatePoolTx(params: {
  connection: Connection;
  config: PublicKey;
  baseMint: PublicKey;
  user: PublicKey;
  name: string;
  symbol: string;
  uri: string;
}): Promise<{ tx: Transaction; pool: PublicKey }> {
  const { connection, config, baseMint, user } = params;
  const client = new DynamicBondingCurveClient(connection, 'confirmed');
  const poolConfig = await client.state.getPoolConfig(config);
  if (!poolConfig) throw new Error(`DBC config ${config.toBase58()} not found on this network`);

  // Token-2022 quote mints with extensions beyond metadata (e.g. real xStocks) need the DBC
  // token badge as remaining account 0. Pass it whenever one exists for the quote mint.
  const badge = deriveTokenBadgeAddress(poolConfig.quoteMint);
  const tokenBadge = (await connection.getAccountInfo(badge, 'confirmed')) ? badge : undefined;

  const tx = await client.creator.createPool({
    config,
    baseMint,
    name: params.name,
    symbol: params.symbol,
    uri: params.uri,
    payer: user,
    poolCreator: user,
    ...(tokenBadge ? { tokenBadge } : {}),
  });
  addPriorityFee(tx, 400_000);
  tx.feePayer = user;
  tx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
  return { tx, pool: deriveDbcPoolAddress(poolConfig.quoteMint, baseMint, config) };
}
