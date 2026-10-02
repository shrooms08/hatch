// Network selection. NEXT_PUBLIC_* values are inlined at build time, so reference them literally.

export type SolanaNetwork = 'devnet' | 'mainnet-beta';

export const NETWORK: SolanaNetwork =
  process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'mainnet-beta' ? 'mainnet-beta' : 'devnet';

const DEFAULT_RPC: Record<SolanaNetwork, string> = {
  devnet: 'https://api.devnet.solana.com',
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
};

/** RPC used in the browser (wallet sends + chain reads). */
export const PUBLIC_RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || DEFAULT_RPC[NETWORK];

/** RPC used by API routes. Falls back to the public one. */
export function serverRpcUrl() {
  return process.env.RPC_URL || PUBLIC_RPC_URL;
}

const clusterParam = NETWORK === 'devnet' ? '?cluster=devnet' : '';
export const explorerTxUrl = (sig: string) => `https://explorer.solana.com/tx/${sig}${clusterParam}`;
export const explorerAddressUrl = (address: string) =>
  `https://explorer.solana.com/address/${address}${clusterParam}`;

export const PRIORITY_FEE_MICROLAMPORTS = Number(
  process.env.NEXT_PUBLIC_PRIORITY_FEE_MICROLAMPORTS ?? 100_000
);

/** Jupiter-indexer features (explore lists, search, charts, tables, Jupiter swap plugin). */
export const ENABLE_JUPITER_DATA = process.env.NEXT_PUBLIC_ENABLE_JUPITER_DATA === 'true';
