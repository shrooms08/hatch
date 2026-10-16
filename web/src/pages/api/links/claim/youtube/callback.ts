// GET /api/links/claim/youtube/callback?code&state -> checks the video's channel is one the signed-in Google account
// manages, sets the verified-id cookie (identity = channel id), back to /claim/<mint>. The token is never stored.
import type { NextApiRequest, NextApiResponse } from 'next';
import { rateLimited } from '@/lib/server/rateLimit';
import { linkNetwork } from '@/lib/server/links/chain';
import { getLinkByMint } from '@/lib/server/links/store';
import { YoutubeVerifyError, verifyYoutubeOwner } from '@/lib/server/links/youtube';
import { logRefused, logVerified } from '@/lib/server/links/claims';
import { ID_COOKIE, OAUTH_COOKIE, clearCookie, setCookie, sign, siteOrigin, verify, type OAuthCookie, type VerifiedId } from '@/lib/server/links/claimCookie';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();
  const network = linkNetwork();
  if (!network) return res.status(404).json({ error: 'Not available on this network' });
  if (rateLimited(req, res, 'claim-yt-callback', 30, 60 * 60_000)) return;
  res.setHeader('Cache-Control', 'no-store');
  const saved = verify<OAuthCookie>(req.cookies[OAUTH_COOKIE]);
  clearCookie(req, res, OAUTH_COOKIE);
  const back = (mint: string, q: string) => res.redirect(302, `/claim/${mint}?${q}`);
  if (!saved || saved.platform !== 'youtube' || typeof req.query.state !== 'string' || req.query.state !== saved.state || typeof req.query.code !== 'string') {
    return saved ? back(saved.mint, `error=${encodeURIComponent(typeof req.query.error === 'string' ? 'Google sign-in was cancelled.' : 'Google sign-in expired. Try again.')}`) : res.redirect(302, '/');
  }
  const link = await getLinkByMint(network, saved.mint);
  if (!link || link.kind !== 'youtube_video') return back(saved.mint, `error=${encodeURIComponent('This coin is not for a YouTube video')}`);
  try {
    const who = await verifyYoutubeOwner({ code: req.query.code, verifier: saved.verifier, redirectUri: `${siteOrigin(req)}/api/links/claim/youtube/callback`, videoId: link.canonical_id.replace(/^yt:video:/, '') });
    const id: VerifiedId = { mint: saved.mint, canonicalId: link.canonical_id, platform: 'youtube', accountId: who.accountId, login: who.login, verifiedAt: new Date().toISOString(), exp: Date.now() + 30 * 60_000, trust: who.trust };
    setCookie(req, res, ID_COOKIE, sign(id), 1800);
    await logVerified(id);
    return back(saved.mint, 'verified=1');
  } catch (e) {
    const msg = e instanceof YoutubeVerifyError ? e.message : 'Google sign-in failed. Try again.';
    await logRefused({ canonicalId: link.canonical_id, platform: 'youtube', reason: msg }).catch((): void => undefined);
    return back(saved.mint, `error=${encodeURIComponent(msg)}`);
  }
}
