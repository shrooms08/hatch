// POST /api/links/confirm { canonicalId, signature } -> verifies on chain (transaction succeeded and touched the
// reserved pool; the pool is under the LINK config, for the reserved mint, with the vault as creator) and marks
// the link hatched. Idempotent.
import { linkRoute } from '@/lib/server/links/route';
import { confirmLink } from '@/lib/server/links/service';

export default linkRoute({ method: 'POST', bucket: 'links-confirm', limit: 60, windowMs: 60_000 }, (req) => confirmLink(req.body ?? {}));
