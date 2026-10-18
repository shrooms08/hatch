// POST /api/links/claim/x/verify { mint, code, postUrl }: checks the code post with X's free public oEmbed (both
// posts fetched now), then sets the verified-id cookie (identity: the X handle at claim time + the post as evidence).
import { linkRoute } from '@/lib/server/links/route';
import { LinkApiError } from '@/lib/server/links/service';
import { verifyXClaim } from '@/lib/server/links/x';
import { logRefused, logVerified } from '@/lib/server/links/claims';
import { ID_COOKIE, X_SESSION_COOKIE, setCookie, sign, verify } from '@/lib/server/links/claimCookie';

export default linkRoute({ method: 'POST', bucket: 'claim-x-verify', limit: 20, windowMs: 60 * 60_000 }, async (req, res) => {
  const session = verify<{ id: string; exp: number }>(req.cookies[X_SESSION_COOKIE]);
  if (!session) throw new LinkApiError(400, 'Get a code first (this browser has no code yet)');
  const body = (req.body ?? {}) as { mint?: unknown; code?: unknown; postUrl?: unknown };
  res.setHeader('Cache-Control', 'no-store');
  try {
    const id = await verifyXClaim({ mint: body.mint, code: body.code, postUrl: body.postUrl, sessionId: session.id });
    setCookie(req, res, ID_COOKIE, sign(id), 1800);
    await logVerified(id);
    return { verified: true, login: id.login };
  } catch (e) {
    if (e instanceof LinkApiError) {
      const { getLinkByMint } = await import('@/lib/server/links/store');
      const { linkNetwork } = await import('@/lib/server/links/chain');
      const n = linkNetwork();
      const link = n && typeof body.mint === 'string' ? await getLinkByMint(n, body.mint).catch((): null => null) : null;
      if (link) await logRefused({ canonicalId: link.canonical_id, platform: 'x', reason: e.message }).catch((): void => undefined);
    }
    throw e;
  }
});
