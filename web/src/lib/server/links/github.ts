// Server-only: "Verify with GitHub" for link coin claims (OAuth app, state + PKCE S256).
// Scope: read:org only (needed to read the signed-in user's role in an organization; the user's own id and login
// need no scope). The access token is used for these checks and then dropped: it is never stored or logged.
// What is kept: platform, account id, login, verified time (in a signed, short-lived, httpOnly cookie, and in the
// claim log / claims row once a claim is submitted).
import { createHash, randomBytes } from 'node:crypto';
import { githubOwnsRepo, OWNER_REFUSAL } from '@/lib/links/ownerRule';
import type { OwnerTrust } from '@/lib/links/claimRules';

export const GITHUB_SCOPE = 'read:org';
const UA = 'hatch-link-claims';

export function githubOAuthConfig(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export const b64url = (b: Buffer) => b.toString('base64url');

export function newPkce() {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge, state: b64url(randomBytes(24)) };
}

export function authorizeUrl(p: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const u = new URL('https://github.com/login/oauth/authorize');
  u.searchParams.set('client_id', p.clientId);
  u.searchParams.set('redirect_uri', p.redirectUri);
  u.searchParams.set('scope', GITHUB_SCOPE);
  u.searchParams.set('state', p.state);
  u.searchParams.set('code_challenge', p.challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  u.searchParams.set('allow_signup', 'false');
  return u.toString();
}

async function gh<T>(path: string, token: string | null): Promise<{ status: number; body: T | null }> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': UA, 'x-github-api-version': '2022-11-28', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(10_000),
  });
  return { status: res.status, body: res.ok ? ((await res.json()) as T) : null };
}

export class GithubVerifyError extends Error {}

/**
 * Exchanges the code (with the PKCE verifier), then checks the owner rule for the repo by its PERMANENT numeric id.
 * Returns the verified account; throws GithubVerifyError with a user-facing message otherwise.
 */
export async function verifyGithubOwner(p: {
  code: string;
  verifier: string;
  redirectUri: string;
  githubRepoId: number;
  /** "gh:repo:owner/repo" as hatched, and the owner's numeric id then: a different name or owner now = renamed / transferred. */
  canonicalId: string;
  hatchedOwnerId: string | null;
}): Promise<{ accountId: string; login: string; via: 'user' | 'org-admin'; trust: OwnerTrust }> {
  const cfg = githubOAuthConfig();
  if (!cfg) throw new GithubVerifyError('GitHub sign-in is not set up on this server');
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': UA },
    body: JSON.stringify({ client_id: cfg.clientId, client_secret: cfg.clientSecret, code: p.code, redirect_uri: p.redirectUri, code_verifier: p.verifier }),
    signal: AbortSignal.timeout(10_000),
  });
  const tok = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; error?: string };
  let token: string | null = tok.access_token ?? null;
  if (!token) throw new GithubVerifyError('GitHub sign-in did not complete. Try again.');
  try {
    const user = await gh<{ id: number; login: string; created_at?: string; followers?: number }>('/user', token);
    if (!user.body || typeof user.body.id !== 'number') throw new GithubVerifyError('Could not read your GitHub account. Try again.');
    // The repo by its permanent id (survives renames and transfers).
    const repo = await gh<{ full_name?: string; stargazers_count?: number; owner: { id: number; type: string; login: string } }>(`/repositories/${p.githubRepoId}`, token);
    if (!repo.body) throw new GithubVerifyError('Could not read this repo on GitHub. Try again in a few minutes.');
    const membership =
      repo.body.owner.type === 'Organization'
        ? (await gh<{ role?: string; state?: string; organization?: { id?: number } }>(`/user/memberships/orgs/${encodeURIComponent(repo.body.owner.login)}`, token)).body
        : null;
    const rule = githubOwnsRepo({ user: user.body, repoOwner: repo.body.owner, membership });
    if ('reason' in rule) throw new GithubVerifyError(OWNER_REFUSAL[rule.reason]);
    const org = repo.body.owner.type === 'Organization' ? (await gh<{ is_verified?: boolean }>(`/orgs/${encodeURIComponent(repo.body.owner.login)}`, token)).body : null;
    const trust: OwnerTrust = {
      platform: 'github',
      accountCreatedAt: user.body.created_at ?? null,
      followers: typeof user.body.followers === 'number' ? user.body.followers : null,
      stars: typeof repo.body.stargazers_count === 'number' ? repo.body.stargazers_count : null,
      platformVerified: org ? org.is_verified === true : null,
      renamedOrTransferred: renamedSinceHatch({ canonicalId: p.canonicalId, hatchedOwnerId: p.hatchedOwnerId, fullName: repo.body.full_name ?? null, ownerId: repo.body.owner.id }),
      checkedAt: new Date().toISOString(),
    };
    return { accountId: String(user.body.id), login: user.body.login, via: rule.via, trust };
  } finally {
    token = null; // used for verification only; dropped here
  }
}

/** The repo's current "owner/name" or owner id differs from when the coin was hatched (case-insensitive). */
export function renamedSinceHatch(p: { canonicalId: string; hatchedOwnerId: string | null; fullName: string | null; ownerId: number }): boolean {
  const hatched = p.canonicalId.replace(/^gh:repo:/, '').toLowerCase();
  if (p.fullName && p.fullName.toLowerCase() !== hatched) return true;
  return !!p.hatchedOwnerId && p.hatchedOwnerId !== String(p.ownerId);
}
