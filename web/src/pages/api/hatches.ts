// GET /api/hatches?wallet=<address>: the wallet's Hatch tokens (pools it created under the
// POOL_CONFIGS presets) with status, progress and claimable creator fees. Reads chain only.
import type { NextApiRequest, NextApiResponse } from 'next';
import { Connection, PublicKey } from '@solana/web3.js';
import { NETWORK, serverRpcUrl } from '@/lib/config/network';
import { fetchHatchPools, STATUS_LABEL } from '@/lib/dbc/pool';
import { fetchOnChainMetadata } from '@/lib/metadata/token';
import { formatAmount } from '@/lib/format/amount';
import { loadHatchConfigs } from '@/lib/server/presets';
import { handleCors } from '@/lib/server/cors';
import { rateLimited } from '@/lib/server/rateLimit';
import type { HatchSummary } from '@/lib/buddy/schema';

const REQUESTS_PER_HOUR = 300;
const symbolCache = new Map<string, string>();
const symbolInflight = new Map<string, Promise<string | null>>();

async function quoteSymbol(connection: Connection, mint: string, isNativeSol: boolean) {
  if (isNativeSol) return 'SOL';
  const cached = symbolCache.get(mint);
  if (cached) return cached;
  // One lookup per mint even when many pools share the quote (parallel duplicates trip RPC rate limits).
  let pending = symbolInflight.get(mint);
  if (!pending) {
    pending = fetchOnChainMetadata(connection, mint)
      .then((md) => md?.symbol || null)
      .catch((): null => null)
      .finally(() => symbolInflight.delete(mint));
    symbolInflight.set(mint, pending);
  }
  const symbol = await pending;
  // Cache only a real symbol: a failed (e.g. rate-limited) read must not pin the fallback forever.
  if (symbol) symbolCache.set(mint, symbol);
  return symbol || `${mint.slice(0, 4)}…`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ wallet: string; network: string; hatches: HatchSummary[] } | { error: string }>
) {
  if (handleCors(req, res, ['GET'])) return;
  const wallet = typeof req.query.wallet === 'string' ? req.query.wallet : '';
  try {
    new PublicKey(wallet);
  } catch {
    return res.status(400).json({ error: 'wallet is not a valid address' });
  }
  if (rateLimited(req, res, 'hatches', REQUESTS_PER_HOUR)) return;

  try {
    const connection = new Connection(serverRpcUrl(), 'confirmed');
    const pools = await fetchHatchPools(connection, loadHatchConfigs(), { creator: wallet });
    const hatches = await Promise.all(
      pools.map(async (p): Promise<HatchSummary> => {
        const md = await fetchOnChainMetadata(connection, p.baseMint).catch((): null => null);
        const qSym = await quoteSymbol(connection, p.quote.address, p.quote.isNativeSol);
        return {
          name: md?.name || 'Unknown token',
          symbol: md?.symbol || '',
          mint: p.baseMint,
          pool: p.address,
          preset: p.presetId,
          progress: Math.round(p.progress * 10_000) / 100,
          status: STATUS_LABEL[p.status] as HatchSummary['status'],
          claimableCreatorFees: {
            amount: formatAmount(p.fees.creatorQuote),
            symbol: qSym,
            hasFees: !p.fees.creatorQuote.isZero() || !p.fees.creatorBase.isZero(),
          },
          tokenUrl: `/token/${p.baseMint}`,
        };
      })
    );
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ wallet, network: NETWORK, hatches });
  } catch (e) {
    console.error('hatches failed:', e instanceof Error ? e.message : e);
    return res.status(502).json({ error: 'Could not read hatches from chain' });
  }
}
