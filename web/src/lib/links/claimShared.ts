// Shared by the claim pages and the server (pure).

/** The approver signs this (with a fresh timestamp) to open /admin/claims. */
export const ADMIN_MESSAGE = (ts: number) => `Hatch admin: review link claims (${ts})`;

/** Custody copy, used everywhere: held for the owner by Hatch's vault (never "trustless"). */
export const HELD_BY_VAULT = "held for the owner by Hatch's vault";

export const lamportsToSol = (l: string | number | bigint | null | undefined) => (l == null ? null : Number(l) / 1e9);
export const formatSol = (sol: number | null) =>
  sol == null ? '-' : sol === 0 ? '0 SOL' : sol < 0.000001 ? '< 0.000001 SOL' : `${Number(sol.toFixed(sol < 0.001 ? 9 : 6)).toString()} SOL`;
export const shortWallet = (w: string | null | undefined) => (w ? `${w.slice(0, 4)}…${w.slice(-4)}` : '-');
