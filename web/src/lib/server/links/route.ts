// Server-only: shared wrapper for /api/links/* routes (CORS, method, per-IP rate limit, safe errors).
// Never logs request URLs, query parameters or bodies (a lookup prefix or a link must not end up in logs).
import type { NextApiRequest, NextApiResponse } from 'next';
import { handleCors } from '@/lib/server/cors';
import { rateLimited } from '@/lib/server/rateLimit';
import { LinkApiError } from './service';
import { linkNetwork } from './chain';

export function linkRoute(opts: { method: 'GET' | 'POST'; bucket: string; limit: number; windowMs: number }, run: (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    if (handleCors(req, res, [opts.method])) return;
    // Link coins are off where linkNetwork() is null (mainnet today): every /api/links route is a 404 there, before
    // any other check (admin sign-in, sessions, bodies) can answer differently.
    if (!linkNetwork()) return res.status(404).json({ error: 'Not found' });
    if (rateLimited(req, res, opts.bucket, opts.limit, opts.windowMs)) return;
    try {
      const out = await run(req, res);
      if (!res.headersSent) res.status(200).json(out);
    } catch (e) {
      if (e instanceof LinkApiError) return res.status(e.status).json({ error: e.message, ...e.extra });
      console.error(`links ${opts.bucket} failed:`, e instanceof Error ? e.message : 'unknown error');
      return res.status(502).json({ error: 'Something went wrong. Try again in a moment.' });
    }
  };
}
