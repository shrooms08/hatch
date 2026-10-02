// Server-only: CORS for routes the Hatch extension calls. Allowed: chrome-extension:// origins
// and the app's own origin. Returns true when it fully handled the request (preflight / blocked).
import type { NextApiRequest, NextApiResponse } from 'next';

function ownOrigin(req: NextApiRequest): string | null {
  const host = req.headers['x-forwarded-host'] ?? req.headers.host;
  if (!host) return null;
  const proto = (req.headers['x-forwarded-proto'] as string | undefined)?.split(',')[0] ?? 'http';
  return `${proto}://${Array.isArray(host) ? host[0] : host}`;
}

export function isAllowedOrigin(req: NextApiRequest, origin: string): boolean {
  return /^chrome-extension:\/\/[a-p]{32}$/.test(origin) || origin === ownOrigin(req);
}

export function handleCors(req: NextApiRequest, res: NextApiResponse, methods: string[]): boolean {
  const origin = req.headers.origin;
  res.setHeader('Vary', 'Origin');
  if (origin) {
    if (!isAllowedOrigin(req, origin)) {
      res.status(403).json({ error: 'Origin not allowed' });
      return true;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', [...methods, 'OPTIONS'].join(', '));
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  if (!methods.includes(req.method ?? '')) {
    res.setHeader('Allow', methods.join(', '));
    res.status(405).json({ error: 'Method not allowed' });
    return true;
  }
  return false;
}
