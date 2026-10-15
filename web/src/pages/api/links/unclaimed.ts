// GET /api/links/unclaimed -> link coins with creator fees held for their owner, most first. Read-only: Hatch never
// tags, posts to or messages owners.
import { linkRoute } from '@/lib/server/links/route';
import { unclaimedCoins } from '@/lib/server/links/claims';

export default linkRoute({ method: 'GET', bucket: 'links-unclaimed', limit: 120, windowMs: 60_000 }, async (_req, res) => {
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
  return { coins: await unclaimedCoins() };
});
