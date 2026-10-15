// Who owns a link, by permanent account id (never a username alone). Pure, shared by the server and tests.

/** GitHub: the repo's owner is the signed-in user (same numeric id), or an org where they are an ACTIVE ADMIN. */
export function githubOwnsRepo(p: {
  user: { id: number };
  repoOwner: { id: number; type: string };
  /** GET /user/memberships/orgs/{org} for the signed-in user (orgs only); null when not a member. */
  membership?: { role?: string; state?: string; organization?: { id?: number } } | null;
}): { ok: true; via: 'user' | 'org-admin' } | { ok: false; reason: 'not-owner' | 'org-not-admin' } {
  if (p.repoOwner.type === 'User') return p.repoOwner.id === p.user.id ? { ok: true, via: 'user' } : { ok: false, reason: 'not-owner' };
  if (p.repoOwner.type === 'Organization') {
    const m = p.membership;
    if (!m || m.organization?.id !== p.repoOwner.id) return { ok: false, reason: 'not-owner' };
    return m.role === 'admin' && m.state === 'active' ? { ok: true, via: 'org-admin' } : { ok: false, reason: 'org-not-admin' };
  }
  return { ok: false, reason: 'not-owner' };
}

export const OWNER_REFUSAL: Record<'not-owner' | 'org-not-admin', string> = {
  'not-owner': "This GitHub account doesn't own this repo",
  'org-not-admin': "This GitHub account doesn't own this repo (you are a member of the organization, but not an admin)",
};
