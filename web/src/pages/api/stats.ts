// GET /api/stats: Home live stats (see lib/server/stats.ts). Computed server-side only, cached 60 s with one
// upstream computation at a time; the CDN serves most hits. If a refresh fails, the last good value is served
// (200, X-Hatch-Stale: 1); an error only when there has never been a good value.
import type { NextApiRequest, NextApiResponse } from 'next';
import { getHatchStats, type HatchStats } from '@/lib/server/stats';

export default async function handler(req: NextApiRequest, res: NextApiResponse<HatchStats | { error: string }>) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { value, stale } = await getHatchStats();
    res.setHeader('Cache-Control', stale ? 'public, s-maxage=10, stale-while-revalidate=300' : 'public, s-maxage=60, stale-while-revalidate=300');
    if (stale) res.setHeader('X-Hatch-Stale', '1');
    return res.status(200).json(value);
  } catch (e) {
    console.error('stats failed:', e instanceof Error ? e.message : e);
    return res.status(502).json({ error: 'Could not read stats from chain right now' });
  }
}
