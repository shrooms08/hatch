// GET /api/links/lookup?p=<first 8 hex chars of sha256(canonical id)>
// Private by design: the client canonicalizes the page's link and hashes it locally, sends only the 8-char
// prefix, and matches its full hash in the answer. The server never learns which page the user is on.
// -> [{ h, status, mint, ticker, name, progress, claimed }] for every link sharing the prefix on this network.
import { isLookupPrefix } from '@/lib/links/canonical';
import { linkRoute } from '@/lib/server/links/route';
import { LinkApiError, lookupPrefix } from '@/lib/server/links/service';

export default linkRoute({ method: 'GET', bucket: 'links-lookup', limit: 120, windowMs: 60_000 }, async (req, res) => {
  const p = req.query.p;
  if (!isLookupPrefix(p)) throw new LinkApiError(400, 'p must be 8 lowercase hex characters');
  const entries = await lookupPrefix(p);
  res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=15, stale-while-revalidate=30');
  return entries;
});
