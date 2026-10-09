// A Hatch token's 5-step lifecycle, derived only from real pool data (pure; unit-tested):
//   1 Launched -> 2 Shield (v2 pools: first 60 s, fee 50% -> 1%) -> 3 Bonding curve -> 4 Graduation (100%)
//   -> 5 DAMM v2 (trading on Meteora once migrated).
export type StepState = 'done' | 'current' | 'future' | 'skipped';
export type StepKey = 'launched' | 'shield' | 'curve' | 'graduation' | 'damm';

export type LifecycleInput = {
  /** Unix seconds trading opened (0 / unknown for slot-activated pools). */
  launchedAt: number | null;
  /** v2 pools: the decaying fee scheduler exists. */
  hasShield: boolean;
  /** True while the shield's fee is still decaying (now < activation + 60 s). */
  shieldLive: boolean;
  progress: number;
  isMigrated: boolean;
};

export type LifecycleStep = { key: StepKey; state: StepState };

export function lifecycleSteps(p: LifecycleInput): LifecycleStep[] {
  // The one step the pool is in now.
  const current: StepKey = p.isMigrated ? 'damm' : p.progress >= 1 ? 'graduation' : p.hasShield && p.shieldLive ? 'shield' : 'curve';
  const order: StepKey[] = ['launched', 'shield', 'curve', 'graduation', 'damm'];
  const at = order.indexOf(current);
  return order.map((key, i) => ({
    key,
    state: key === 'shield' && !p.hasShield ? 'skipped' : i < at ? 'done' : i === at ? 'current' : 'future',
  }));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "15:00, 11 Oct" in the viewer's time zone. */
export function formatLaunchTime(unixS: number): string {
  const d = new Date(unixS * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** "just now", "12m ago", "2h ago", "3d ago". */
export function timeAgo(unixS: number, nowS = Date.now() / 1000): string {
  const s = Math.max(0, nowS - unixS);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** Seconds -> ["MM", "SS"]. */
export const countdownParts = (seconds: number): [string, string] => {
  const s = Math.max(0, Math.ceil(seconds));
  return [String(Math.floor(s / 60)).padStart(2, '0'), String(s % 60).padStart(2, '0')];
};
