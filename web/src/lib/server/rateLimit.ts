// Server-only: simple in-memory sliding-window rate limit per client IP and bucket.
// Per server instance only (resets on restart; not shared across serverless instances).
import type { NextApiRequest, NextApiResponse } from 'next';

const hits = new Map<string, number[]>();

export function clientIp(req: NextApiRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || req.socket.remoteAddress || 'unknown';
}

/** Returns true (and sends 429) when the caller is over `limit` requests per `windowMs`. */
export function rateLimited(
  req: NextApiRequest,
  res: NextApiResponse,
  bucket: string,
  limit: number,
  windowMs = 60 * 60 * 1000
): boolean {
  const key = `${bucket}:${clientIp(req)}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    const retryAfter = Math.ceil((recent[0] + windowMs - now) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({ error: `Too many requests, try again in ${Math.ceil(retryAfter / 60)} min` });
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  }
  return false;
}

let capDay = '';
let capCount = 0;

/**
 * Global per-instance daily cap (AI_DAILY_CAP, default 300) on top of the per-IP limits. Returns true
 * (and sends 503) once today's (UTC) count is used up.
 */
export function dailyCapReached(res: NextApiResponse, cap = Number(process.env.AI_DAILY_CAP) || 300): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== capDay) {
    capDay = today;
    capCount = 0;
  }
  if (capCount >= cap) {
    res.status(503).json({ error: 'Hatch is resting, try again later' });
    return true;
  }
  capCount++;
  return false;
}
