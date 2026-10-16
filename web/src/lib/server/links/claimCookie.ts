// Server-only: small signed cookies for the claim flow (HMAC-SHA256 with LINK_CLAIM_SECRET; httpOnly, SameSite=Lax).
//   hatch_claim_oauth: the OAuth state + PKCE verifier + which coin, for 10 minutes
//   hatch_claim_id:    the verified account (platform, account id, login, verified time) for one coin, 30 minutes
// No access tokens, ever.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextApiRequest, NextApiResponse } from 'next';

export const OAUTH_COOKIE = 'hatch_claim_oauth';
export const ID_COOKIE = 'hatch_claim_id';

export type OAuthCookie = { state: string; verifier: string; mint: string; exp: number };
export type VerifiedId = { mint: string; canonicalId: string; platform: 'github'; accountId: string; login: string; verifiedAt: string; exp: number; trust?: import('@/lib/links/claimRules').OwnerTrust };

function secret(): string {
  const s = process.env.LINK_CLAIM_SECRET?.trim();
  if (!s || s.length < 32) throw new Error('LINK_CLAIM_SECRET is not set');
  return s;
}

export function sign(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verify<T extends { exp: number }>(value: string | undefined, now = Date.now()): T | null {
  if (!value) return null;
  const [body, mac] = value.split('.');
  if (!body || !mac) return null;
  const want = createHmac('sha256', secret()).update(body).digest();
  const got = Buffer.from(mac, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
    return typeof p.exp === 'number' && p.exp > now ? p : null;
  } catch {
    return null;
  }
}

export function setCookie(req: NextApiRequest, res: NextApiResponse, name: string, value: string, maxAgeS: number) {
  const secure = (req.headers['x-forwarded-proto'] ?? '') === 'https' || !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(String(req.headers.host ?? ''));
  const prev = res.getHeader('Set-Cookie');
  const list = Array.isArray(prev) ? prev.map(String) : prev ? [String(prev)] : [];
  list.push(`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeS}${secure ? '; Secure' : ''}`);
  res.setHeader('Set-Cookie', list);
}

export const clearCookie = (req: NextApiRequest, res: NextApiResponse, name: string) => setCookie(req, res, name, '', 0);

/** Origin for the OAuth redirect: HATCH_SITE_ORIGIN, else this request's host (localhost over http). */
export function siteOrigin(req: NextApiRequest): string {
  if (process.env.HATCH_SITE_ORIGIN) return process.env.HATCH_SITE_ORIGIN.replace(/\/$/, '');
  const host = String(req.headers.host ?? '');
  return /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? `http://${host}` : `https://${host}`;
}
