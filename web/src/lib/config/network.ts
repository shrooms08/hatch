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
const RPC_PROXY_PATH = '/api/rpc';

/**
 * Hatch's own proxy ("/api/rpc", or an absolute URL ending in /api/rpc such as https://hatchfun.vercel.app/api/rpc)
 * is always called on the page's own origin: the site is served from more than one domain (hatchem.fun and
 * hatchfun.vercel.app) and /api/rpc only accepts same-origin requests. Any other RPC URL is used as given.
 */
export function browserRpcUrl(raw: string, pageOrigin: string | null): string {
  if (!pageOrigin) return raw;
  if (raw.startsWith('/')) return `${pageOrigin}${raw}`;
  try {
    return new URL(raw).pathname === RPC_PROXY_PATH ? `${pageOrigin}${RPC_PROXY_PATH}` : raw;
  } catch {
    return raw;
  }
}

export const PUBLIC_RPC_URL = browserRpcUrl(RAW_PUBLIC_RPC, typeof window !== 'undefined' ? window.location.origin : null);

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

