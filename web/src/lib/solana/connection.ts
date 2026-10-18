import { Connection } from '@solana/web3.js';
import { NETWORK, PUBLIC_RPC_URL } from '@/lib/config/network';
import { createRpcFetch } from './rpcFetch';

let browserConnection: Connection | null = null;

/**
 * Shared browser connection (singleton).
 * Devnet: reads retry on 429 / network errors with backoff, sends are never retried, identical reads in flight are
 * shared (lib/solana/rpcFetch); web3.js's own 429 retry is off so that is the only policy.
 * Mainnet: unchanged (web3.js defaults) until this has been tried on devnet.
 */
export function getConnection(): Connection {
  if (!browserConnection) {
    browserConnection =
      NETWORK === 'devnet'
        ? new Connection(PUBLIC_RPC_URL, { commitment: 'confirmed', disableRetryOnRateLimit: true, fetch: createRpcFetch((input, init) => fetch(input, init)) as unknown as typeof fetch })
        : new Connection(PUBLIC_RPC_URL, 'confirmed');
  }
  return browserConnection;
}
