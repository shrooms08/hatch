// Server-only guards for /api/upload.
import type { Connection, PublicKey } from '@solana/web3.js';

/** The mint already exists on chain: its metadata and image were set at launch and are final. */
export class MintExistsError extends Error {
  constructor() {
    super('This mint already exists. Metadata of a launched token cannot be replaced.');
  }
}

/**
 * Uploads are only for brand-new mints (a fresh keypair the client is about to create). Without this,
 * anyone could re-upload metadata or images for a token that is already live.
 */
export async function assertMintIsNew(connection: Pick<Connection, 'getAccountInfo'>, mint: PublicKey): Promise<void> {
  const account = await connection.getAccountInfo(mint, 'confirmed');
  if (account) throw new MintExistsError();
}
