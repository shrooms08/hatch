// GET /api/links/hatched?wallet=<address> -> { hatches: [{ mint, pool, canonicalId, link, claimed }] }: the link coins
// this wallet hatched (paid for). Public information: the fee payer of a pool's creation transaction is on chain.
import { linkRoute } from '@/lib/server/links/route';
import { linkHatchesFor } from '@/lib/server/links/service';

export default linkRoute({ method: 'GET', bucket: 'links-hatched', limit: 120, windowMs: 60_000 }, async (req, res) => {
  const hatches = await linkHatchesFor(req.query.wallet);
  res.setHeader('Cache-Control', 'private, max-age=10');
  return { hatches };
});
