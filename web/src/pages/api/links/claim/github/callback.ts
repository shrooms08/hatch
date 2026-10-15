// GET /api/links/claim/github/callback?code&state -> verifies the owner rule, sets the verified-id cookie, back to
// /claim/<mint>. The GitHub access token is used for the checks only and never stored or logged.
import type { NextApiRequest, NextApiResponse } from 'next';
import { rateLimited } from '@/lib/server/rateLimit';
import { linkNetwork } from '@/lib/server/links/chain';
import { getLinkByMint } from '@/lib/server/links/store';
import { GithubVerifyError, verifyGithubOwner } from '@/lib/server/links/github';
import { logRefused, logVerified } from '@/lib/server/links/claims';
import { ID_COOKIE, OAUTH_COOKIE, clearCookie, setCookie, sign, siteOrigin, verify, type OAuthCookie, type VerifiedId } from '@/lib/server/links/claimCookie';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();
  const network = linkNetwork();
  if (!network) return res.status(404).json({ error: 'Not available on this network' });
  if (rateLimited(req, res, 'claim-gh-callback', 30, 60 * 60_000)) return;
  res.setHeader('Cache-Control', 'no-store');
  const saved = verify<OAuthCookie>(req.cookies[OAUTH_COOKIE]);
  clearCookie(req, res, OAUTH_COOKIE);
  const back = (mint: string, q: string) => res.redirect(302, `/claim/${mint}?${q}`);
  if (!saved || typeof req.query.state !== 'string' || req.query.state !== saved.state || typeof req.query.code !== 'string') {
    return saved ? back(saved.mint, `error=${encodeURIComponent('GitHub sign-in expired. Try again.')}`) : res.redirect(302, '/');
  }
  const link = await getLinkByMint(network, saved.mint);
  if (!link || link.kind !== 'github_repo' || !link.github_repo_id) return back(saved.mint, `error=${encodeURIComponent('This coin is not for a GitHub repo')}`);
  try {
    const who = await verifyGithubOwner({ code: req.query.code, verifier: saved.verifier, redirectUri: `${siteOrigin(req)}/api/links/claim/github/callback`, githubRepoId: link.github_repo_id });
    const id: VerifiedId = { mint: saved.mint, canonicalId: link.canonical_id, platform: 'github', accountId: who.accountId, login: who.login, verifiedAt: new Date().toISOString(), exp: Date.now() + 30 * 60_000 };
    setCookie(req, res, ID_COOKIE, sign(id), 1800);
    await logVerified(id);
    return back(saved.mint, 'verified=1');
  } catch (e) {
    const msg = e instanceof GithubVerifyError ? e.message : 'GitHub sign-in failed. Try again.';
    await logRefused({ canonicalId: link.canonical_id, platform: 'github', reason: msg }).catch((): void => undefined);
    return back(saved.mint, `error=${encodeURIComponent(msg)}`);
  }
}
