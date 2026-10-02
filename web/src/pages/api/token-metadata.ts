// GET /api/token-metadata?mint=<mint>: on-chain name/symbol/uri plus the off-chain metadata JSON,
// fetched server-side (metadata hosts such as R2 public buckets send no CORS headers).
// Only the URI recorded on-chain for the mint is fetched, so this is not an open proxy.
import type { NextApiRequest, NextApiResponse } from 'next';
import { Connection, PublicKey } from '@solana/web3.js';
import { serverRpcUrl } from '@/lib/config/network';
import { fetchOnChainMetadata, pickMetadataJson, type HatchTokenMetadata } from '@/lib/metadata/token';
import { SafeFetchError, safeFetchBytes } from '@/lib/server/safeFetch';

const MAX_JSON_BYTES = 256 * 1024;

export default async function handler(req: NextApiRequest, res: NextApiResponse<HatchTokenMetadata | { error: string }>) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const mint = typeof req.query.mint === 'string' ? req.query.mint : '';
  try {
    new PublicKey(mint);
  } catch {
    return res.status(400).json({ error: 'mint is not a valid address' });
  }

  try {
    const onChain = await fetchOnChainMetadata(new Connection(serverRpcUrl(), 'confirmed'), mint);
    if (!onChain) return res.status(404).json({ error: 'No metadata for this mint' });

    let json: HatchTokenMetadata['json'] = null;
    try {
      json = pickMetadataJson(JSON.parse((await safeFetchBytes(onChain.uri, MAX_JSON_BYTES)).toString('utf8')));
    } catch (e) {
      // Missing/invalid off-chain JSON is not fatal: return the on-chain fields.
      if (!(e instanceof SafeFetchError) && !(e instanceof SyntaxError)) throw e;
    }

    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
    return res.status(200).json({ ...onChain, json });
  } catch (e) {
    console.error('token-metadata failed:', e instanceof Error ? e.message : e);
    return res.status(502).json({ error: 'Could not read token metadata' });
  }
}
