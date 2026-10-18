// POST /api/links/claim/nonce { mint, wallet } -> { nonce, message, expiresAt }: the free message the destination
// wallet signs before a claim or disown (needs the verified-id cookie).
import { linkRoute } from '@/lib/server/links/route';
import { issueNonce } from '@/lib/server/links/claims';
import { ID_COOKIE, verify, type VerifiedId } from '@/lib/server/links/claimCookie';

export default linkRoute({ method: 'POST', bucket: 'claim-nonce', limit: 30, windowMs: 60 * 60_000 }, async (req) =>
  issueNonce(verify<VerifiedId>(req.cookies[ID_COOKIE]), (req.body ?? {}) as Record<string, unknown>)
);
