// POST /api/links/prepare { url, firstBuySol? } -> canonical id, maxFirstBuySol, metadata (owner, title, image), a suggested name/ticker, and
// either { exists: { mint, status, ... } }, { reserved: { retryInSeconds } } or { available: true }.
import { linkRoute } from '@/lib/server/links/route';
import { prepareLink } from '@/lib/server/links/service';

export default linkRoute({ method: 'POST', bucket: 'links-prepare', limit: 60, windowMs: 60_000 }, (req) => prepareLink(req.body ?? {}));
