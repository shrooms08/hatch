// GET /api/links/claim/youtube/start?mint=<mint> -> redirect to Google (state + PKCE S256, scope youtube.readonly).
import type { NextApiRequest, NextApiResponse } from 'next';
import { PublicKey } from '@solana/web3.js';
import { rateLimited } from '@/lib/server/rateLimit';
import { linkNetwork } from '@/lib/server/links/chain';
import { isVaultConfigured } from '@/lib/server/links/squads';
import { googleAuthorizeUrl, googleOAuthConfig, newPkce } from '@/lib/server/links/youtube';
import { OAUTH_COOKIE, setCookie, sign, siteOrigin } from '@/lib/server/links/claimCookie';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!linkNetwork() || !isVaultConfigured()) return res.status(404).json({ error: 'Not available on this network' });
  if (rateLimited(req, res, 'claim-yt-start', 20, 60 * 60_000)) return;
  let mint: string;
  try {
    mint = new PublicKey(String(req.query.mint ?? '')).toBase58();
  } catch {
    return res.status(400).json({ error: 'mint is invalid' });
  }
  const cfg = googleOAuthConfig();
  if (!cfg) return res.redirect(302, `/claim/${mint}?error=${encodeURIComponent('YouTube sign-in is not set up on this server yet')}`);
  const { verifier, challenge, state } = newPkce();
  setCookie(req, res, OAUTH_COOKIE, sign({ state, verifier, mint, platform: 'youtube', exp: Date.now() + 10 * 60_000 }), 600);
  res.setHeader('Cache-Control', 'no-store');
  return res.redirect(302, googleAuthorizeUrl({ clientId: cfg.clientId, redirectUri: `${siteOrigin(req)}/api/links/claim/youtube/callback`, state, challenge }));
}
