// POST /api/links/claim/submit { mint, action: 'claim' | 'disown', destination } (needs the verified-id cookie).
// Creates the claim and ONE Squads proposal. Rate limited per IP here and per verified account in the service.
import { linkRoute } from '@/lib/server/links/route';
import { submitClaim } from '@/lib/server/links/claims';
import { ID_COOKIE, verify, type VerifiedId } from '@/lib/server/links/claimCookie';

export default linkRoute({ method: 'POST', bucket: 'claim-submit', limit: 10, windowMs: 60 * 60_000 }, async (req) =>
  submitClaim(verify<VerifiedId>(req.cookies[ID_COOKIE]), (req.body ?? {}) as Record<string, unknown>)
);
