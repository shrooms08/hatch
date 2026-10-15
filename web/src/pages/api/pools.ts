// GET /api/pools: the public Hatch pool list for the home page, read from chain server-side (cached 30 s,
// one scan at a time, last good list on upstream errors) so browsers make no getProgramAccounts calls.
import type { NextApiRequest, NextApiResponse } from 'next';
import { allHatchPools } from '@/lib/server/pools';
import { loadHatchConfigs } from '@/lib/server/presets';
import { poolToJson, type PoolJson } from '@/lib/dbc/poolJson';
import { rateLimited } from '@/lib/server/rateLimit';
import { listedLinkPools } from '@/lib/server/links/service';
import type { HatchPool } from '@/lib/dbc/pool';

export type PoolsResponse = { pools: PoolJson[]; at: number };

export default async function handler(req: NextApiRequest, res: NextApiResponse<PoolsResponse | { error: string }>) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (rateLimited(req, res, 'pools', 240, 60_000)) return;
  try {
    const { value, at, stale } = await allHatchPools();
    const hidden = loadHatchConfigs().hiddenMints;
    // Link coins (devnet for now): from the links table, checked against chain; the launch list never waits on them.
    const linkPools = await listedLinkPools().catch((e): HatchPool[] => {
      console.error('pools: link coins skipped:', e instanceof Error ? e.message : e);
      return [];
    });
    const pools = [...value, ...linkPools].filter((p) => !hidden.includes(p.baseMint)).map(poolToJson);
    res.setHeader('Cache-Control', stale ? 'public, s-maxage=10, stale-while-revalidate=300' : 'public, s-maxage=30, stale-while-revalidate=300');
    if (stale) res.setHeader('X-Hatch-Stale', '1');
    return res.status(200).json({ pools, at });
  } catch (e) {
    console.error('pools failed:', e instanceof Error ? e.message : e);
    return res.status(502).json({ error: 'Could not read pools right now' });
  }
}
