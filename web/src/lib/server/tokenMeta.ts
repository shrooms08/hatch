// Server-only: a token's name, symbol and image (on-chain metadata + its JSON), cached 10 minutes.
import type { Connection } from '@solana/web3.js';
import { fetchOnChainMetadata, pickMetadataJson } from '@/lib/metadata/token';
import { safeFetchBytes } from '@/lib/server/safeFetch';

export type TokenMeta = { name: string; symbol: string; image: string | null };
const TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; meta: Promise<TokenMeta | null> }>();

export function tokenMeta(connection: Connection, mint: string): Promise<TokenMeta | null> {
  const hit = cache.get(mint);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.meta;
  const meta = (async () => {
    const md = await fetchOnChainMetadata(connection, mint);
    if (!md) return null;
    let image: string | null = null;
    try {
      image = pickMetadataJson(JSON.parse((await safeFetchBytes(md.uri, 256 * 1024)).toString('utf8')))?.image ?? null;
    } catch {
      /* JSON optional */
    }
    return { name: md.name, symbol: md.symbol, image };
  })().catch((e) => {
    cache.delete(mint);
    throw e;
  });
  cache.set(mint, { at: Date.now(), meta });
  if (cache.size > 2000) cache.clear();
  return meta;
}
