// Network selection. NEXT_PUBLIC_* values are inlined at build time, so reference them literally.

export type SolanaNetwork = 'devnet' | 'mainnet-beta';

export const NETWORK: SolanaNetwork =
  process.env.NEXT_PUBLIC_SOLANA_NETWORK === 'mainnet-beta' ? 'mainnet-beta' : 'devnet';

const DEFAULT_RPC: Record<SolanaNetwork, string> = {
  devnet: 'https://api.devnet.solana.com',
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
};

/**
 * RPC used in the browser (wallet sends + chain reads). On mainnet this is Hatch's own /api/rpc proxy,
 * so no provider key ever ships to the browser. A path ("/api/rpc") resolves against the page origin.
 */
const RAW_PUBLIC_RPC = process.env.NEXT_PUBLIC_RPC_URL || DEFAULT_RPC[NETWORK];
export const PUBLIC_RPC_URL =
  RAW_PUBLIC_RPC.startsWith('/') && typeof window !== 'undefined' ? `${window.location.origin}${RAW_PUBLIC_RPC}` : RAW_PUBLIC_RPC;

/** RPC used by API routes and the /api/rpc proxy (secret; server only). */
export function serverRpcUrl() {
  const url = process.env.HATCH_SERVER_RPC_URL || process.env.RPC_URL;
  if (url) return url;
  return RAW_PUBLIC_RPC.startsWith('/') ? DEFAULT_RPC[NETWORK] : RAW_PUBLIC_RPC;
}

const clusterParam = NETWORK === 'devnet' ? '?cluster=devnet' : '';
export const EXPLORER_NAME = 'Solscan';
export const explorerTxUrl = (sig: string) => `https://solscan.io/tx/${sig}${clusterParam}`;
export const explorerAddressUrl = (address: string) => `https://solscan.io/account/${address}${clusterParam}`;
/** Meteora's pool page (DAMM v2 after a token hatches). */
export const meteoraPoolUrl = (pool: string) =>
  NETWORK === 'devnet' ? `https://devnet.meteora.ag/dammv2/${pool}` : `https://www.meteora.ag/dammv2/${pool}`;

export const PRIORITY_FEE_MICROLAMPORTS = Number(
  process.env.NEXT_PUBLIC_PRIORITY_FEE_MICROLAMPORTS ?? 100_000
);

