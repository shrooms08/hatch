// POST /api/links/claim/x/code { mint } -> { code, issuedAt, expiresAt }: a one-time code to post from the X account
// that posted the original. Bound to this coin and this browser (an httpOnly session cookie), 30 minutes, single use.
import { randomBytes } from 'node:crypto';
import { linkRoute } from '@/lib/server/links/route';
import { issueXCode } from '@/lib/server/links/x';
import { X_SESSION_COOKIE, setCookie, sign, verify } from '@/lib/server/links/claimCookie';

export default linkRoute({ method: 'POST', bucket: 'claim-x-code', limit: 10, windowMs: 60 * 60_000 }, async (req, res) => {
  let session = verify<{ id: string; exp: number }>(req.cookies[X_SESSION_COOKIE]);
  if (!session) {
    session = { id: randomBytes(16).toString('hex'), exp: Date.now() + 2 * 60 * 60_000 };
    setCookie(req, res, X_SESSION_COOKIE, sign(session), 2 * 60 * 60);
  }
  res.setHeader('Cache-Control', 'no-store');
  return issueXCode((req.body as { mint?: unknown } | undefined)?.mint, session.id);
});
