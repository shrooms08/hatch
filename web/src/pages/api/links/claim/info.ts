// GET /api/links/claim/info?mint=<mint> -> the coin, link, owner, fees held now (from chain), verification, claim state.
import { linkRoute } from '@/lib/server/links/route';
import { claimInfo } from '@/lib/server/links/claims';
import { ID_COOKIE, verify, type VerifiedId } from '@/lib/server/links/claimCookie';

export default linkRoute({ method: 'GET', bucket: 'claim-info', limit: 120, windowMs: 60_000 }, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  return claimInfo(req.query.mint, verify<VerifiedId>(req.cookies[ID_COOKIE]));
});
