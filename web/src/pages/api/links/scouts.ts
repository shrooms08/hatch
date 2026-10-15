// GET /api/links/scouts -> wallets that hatched link coins: coins hatched, coins graduated (credit only).
import { linkRoute } from '@/lib/server/links/route';
import { scouts } from '@/lib/server/links/claims';

export default linkRoute({ method: 'GET', bucket: 'links-scouts', limit: 120, windowMs: 60_000 }, async (_req, res) => {
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  return { scouts: await scouts() };
});
