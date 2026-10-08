// GET /api/stats: Home live stats (see lib/server/stats.ts for how they are computed). Cached 60s.
import type { NextApiRequest, NextApiResponse } from 'next';
import { getHatchStats, type HatchStats } from '@/lib/server/stats';

export default async function handler(req: NextApiRequest, res: NextApiResponse<HatchStats | { error: string }>) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const stats = await getHatchStats();
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(stats);
  } catch (e) {
    console.error('stats failed:', e instanceof Error ? e.message : e);
    return res.status(502).json({ error: 'Could not read stats from chain right now' });
  }
}
