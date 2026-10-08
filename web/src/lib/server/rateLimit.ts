// Server-only: simple in-memory sliding-window rate limit per client IP and bucket.
// Per server instance only (resets on restart; not shared across serverless instances).
import type { NextApiRequest, NextApiResponse } from 'next';

const hits = new Map<string, number[]>();

export function clientIp(req: NextApiRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
}

/**
 * Returns true (and sends 429) when the caller would go over `limit` units per `windowMs`.
 * `cost` charges several units at once (e.g. one per call in a JSON-RPC batch).
 */
export function rateLimited(
  req: NextApiRequest,
  res: NextApiResponse,
  bucket: string,
  limit: number,
  windowMs = 60 * 60 * 1000,
  cost = 1
): boolean {
  const key = `${bucket}:${clientIp(req)}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length + cost > limit) {
    const retryAfter = Math.max(1, Math.ceil(((recent[0] ?? now) + windowMs - now) / 1000));
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({ error: `Too many requests, try again in ${retryAfter < 120 ? `${retryAfter} s` : `${Math.ceil(retryAfter / 60)} min`}` });
    hits.set(key, recent);
    return true;
  }
  for (let i = 0; i < cost; i++) recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  }
  return false;
}

/**
 * Global per-instance daily caps on the AI routes, on top of the per-IP limits:
 * drafts AI_DAILY_CAP (default 300), notices AI_DAILY_NOTICE_CAP (default 1500, a cheaper model).
 * A cap of 0 rests that route. Returns true (and sends 503) once today's (UTC) count is used up.
 */
const CAPS = { draft: { env: 'AI_DAILY_CAP', fallback: 300 }, notice: { env: 'AI_DAILY_NOTICE_CAP', fallback: 1500 } } as const;
type CapBucket = keyof typeof CAPS;

function envCap(bucket: CapBucket) {
  const raw = process.env[CAPS[bucket].env];
  const v = Number(raw);
  return raw !== undefined && raw !== '' && Number.isFinite(v) && v >= 0 ? v : CAPS[bucket].fallback;
}

const capState: Record<CapBucket, { day: string; count: number }> = { draft: { day: '', count: 0 }, notice: { day: '', count: 0 } };

export function dailyCapReached(res: NextApiResponse, bucket: CapBucket = 'draft', cap = envCap(bucket)): boolean {
  const today = new Date().toISOString().slice(0, 10);
  const s = capState[bucket];
  if (today !== s.day) {
    s.day = today;
    s.count = 0;
  }
  if (s.count >= cap) {
    res.status(503).json({ error: 'Hatch is resting, try again later' });
    return true;
  }
  s.count++;
  return false;
}
