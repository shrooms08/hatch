// Claim hardening rules (P4a.1). Pure: shared by the server, the claim / admin / token pages and the tests.

// ---------- destination signature ----------

/** The free message the destination wallet signs before a claim or disown is submitted. */
export function destinationMessage(p: { ticker: string | null; mint: string; platform: string; login: string; accountId: string; wallet: string; nonce: string; date: string }): string {
  return `Hatch claim: ${p.ticker ? `$${p.ticker}` : 'coin'} ${p.mint} for ${p.platform} account ${p.login} (${p.accountId}) to ${p.wallet}, nonce ${p.nonce}, ${p.date}`;
}

/** How long an issued nonce can be signed and submitted. */
export const NONCE_TTL_MS = 10 * 60_000;

// ---------- owner trust signals ----------

/** Recorded at verify time from the platform's public data. Never "verified by Hatch". */
export type ClaimPlatform = 'github' | 'youtube';
export const CLAIM_PLATFORM_NAME: Record<ClaimPlatform, string> = { github: 'GitHub', youtube: 'YouTube' };

export type OwnerTrust = {
  platform: ClaimPlatform;
  /** The signed-in account's creation date (ISO). YouTube: the channel's publishedAt. */
  accountCreatedAt: string | null;
  /** GitHub followers; YouTube subscribers (null when the channel hides them, see followersHidden). */
  followers: number | null;
  /** YouTube: the channel hides its subscriber count (treated as unknown, so the amber label shows). */
  followersHidden?: boolean;
  /** GitHub: the repo's stars. */
  stars: number | null;
  /** The platform's own verified flag where it exists (GitHub: verified organization); null where there is none. */
  platformVerified: boolean | null;
  /** GitHub: the repo's name or owner changed since the coin was hatched (GitHub does not publish rename dates). */
  renamedOrTransferred: boolean;
  checkedAt: string;
};

export const NEW_ACCOUNT_DAYS = 30;
/** "Tiny audience": fewer followers AND fewer stars than this. */
export const SMALL_AUDIENCE = 10;
export const TRUST_LABEL = 'New or small account, check the source';

export type TrustFlags = { newAccount: boolean; smallAudience: boolean; renamed: boolean; ageDays: number | null; risky: boolean };

export function trustFlags(t: OwnerTrust | null | undefined, now = Date.now()): TrustFlags | null {
  if (!t) return null;
  const created = t.accountCreatedAt ? Date.parse(t.accountCreatedAt) : NaN;
  const ageDays = Number.isFinite(created) ? Math.floor((now - created) / 86_400_000) : null;
  const newAccount = ageDays == null || ageDays < NEW_ACCOUNT_DAYS;
  // A hidden subscriber count is unknown, not large: it gets the label too (hiding it must not avoid the check).
  const smallAudience = t.followersHidden === true ? (t.stars ?? 0) < SMALL_AUDIENCE : (t.followers ?? 0) < SMALL_AUDIENCE && (t.stars ?? 0) < SMALL_AUDIENCE;
  return { newAccount, smallAudience, renamed: t.renamedOrTransferred, ageDays, risky: newAccount || smallAudience || t.renamedOrTransferred };
}

/** The amber label, or null. Renames are shown separately (admin checklist), the label is about the account. */
export const trustLabel = (t: OwnerTrust | null | undefined, now = Date.now()) => {
  const f = trustFlags(t, now);
  return f && (f.newAccount || f.smallAudience) ? TRUST_LABEL : null;
};

/** "account 3 years old · 120 followers · 45 stars · verified organization" */
export function trustSummary(t: OwnerTrust | null | undefined, now = Date.now()): string | null {
  const f = trustFlags(t, now);
  if (!t || !f) return null;
  const what = t.platform === 'youtube' ? 'channel' : 'account';
  const age = f.ageDays == null ? `${what} age unknown` : f.ageDays < 60 ? `${what} ${f.ageDays} days old` : f.ageDays < 730 ? `${what} ${Math.floor(f.ageDays / 30)} months old` : `${what} ${Math.floor(f.ageDays / 365)} years old`;
  const parts =
    t.platform === 'youtube'
      ? [age, t.followersHidden ? 'subscribers hidden' : `${t.followers ?? 0} subscribers`]
      : [age, `${t.followers ?? 0} followers`, `${t.stars ?? 0} stars`];
  if (t.platformVerified) parts.push('verified organization on GitHub');
  if (t.renamedOrTransferred) parts.push('repo renamed or transferred since hatching');
  return parts.join(' · ');
}

// ---------- timelock ----------

export const CLAIM_TIMELOCK_HOURS = 48;
export const DEFAULT_CLAIM_TIMELOCK_SOL = 0.5;

/** Claims holding at least `thresholdSol` wait CLAIM_TIMELOCK_HOURS after the proposal before they can execute. */
export const needsTimelock = (heldLamports: bigint | number, thresholdSol: number) => Number(heldLamports) >= Math.round(thresholdSol * 1e9);

export const timelockUntil = (proposedAt: number, hours = CLAIM_TIMELOCK_HOURS) => new Date(proposedAt + hours * 3_600_000).toISOString();

/** Milliseconds until execution is allowed (0 = allowed now). */
export function timelockRemainingMs(until: string | null | undefined, now = Date.now()): number {
  if (!until) return 0;
  const t = Date.parse(until);
  return Number.isFinite(t) ? Math.max(0, t - now) : 0;
}

export const formatRemaining = (ms: number) => (ms <= 0 ? 'now' : ms < 3_600_000 ? `${Math.ceil(ms / 60_000)}m` : `${Math.ceil(ms / 3_600_000)}h`);

// ---------- disputes ----------

export function validateDispute(p: { contact?: unknown; reason?: unknown }): { contact: string; reason: string } | { error: string } {
  const contact = String(p.contact ?? '').trim();
  const reason = String(p.reason ?? '').trim();
  if (contact.length < 3 || contact.length > 200) return { error: 'Add a way to reach you (email, X or GitHub handle)' };
  if (reason.length < 10 || reason.length > 2000) return { error: 'Say why this claim is wrong (10 to 2000 characters)' };
  return { contact, reason };
}
