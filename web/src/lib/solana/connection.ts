import { Connection } from '@solana/web3.js';
import { PUBLIC_RPC_URL } from '@/lib/config/network';

let browserConnection: Connection | null = null;

/** Shared browser connection (singleton). */
export function getConnection(): Connection {
  if (!browserConnection) browserConnection = new Connection(PUBLIC_RPC_URL, 'confirmed');
  return browserConnection;
}
