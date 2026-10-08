/** "2h", "3d", "45m" since a unix-seconds timestamp. */
export function timeAgo(unixSeconds: number | undefined | null, now = Date.now()): string | null {
  if (!unixSeconds) return null;
  const s = Math.max(0, Math.floor(now / 1000 - unixSeconds));
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 60) return `${d}d`;
  return `${Math.floor(d / 30)}mo`;
}

/** Compact USD: $980, $12.4K, $1.24M. */
export function formatUsdCompact(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '-';
  const abs = Math.abs(v);
  const fmt = (n: number, suffix: string) => `$${n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2).replace(/\.0+$/, '')}${suffix}`;
  if (abs >= 1e9) return fmt(v / 1e9, 'B');
  if (abs >= 1e6) return fmt(v / 1e6, 'M');
  if (abs >= 1e3) return fmt(v / 1e3, 'K');
  if (abs >= 1) return `$${v.toFixed(0)}`;
  if (abs === 0) return '$0';
  return `$${v.toFixed(2)}`;
}
