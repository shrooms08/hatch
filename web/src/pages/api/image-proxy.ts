// GET /api/image-proxy?url=<image url>: a page image, fetched server-side (lib/server/imageProxy).
// Only image bytes come back; failures are plain errors so the <img> falls back to the Hatch card.
import type { NextApiRequest, NextApiResponse } from 'next';
import { NotAnImageError, proxiedImage, proxyableUrl } from '@/lib/server/imageProxy';
import { SafeFetchError } from '@/lib/server/safeFetch';
import { rateLimited } from '@/lib/server/rateLimit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const url = proxyableUrl(req.query.url);
  if (!url) return res.status(400).json({ error: 'url must be an http(s) URL' });
  if (rateLimited(req, res, 'image-proxy', 120, 60_000)) return;
  try {
    const { bytes, type } = await proxiedImage(url);
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return res.status(200).send(bytes);
  } catch (e) {
    if (e instanceof NotAnImageError) return res.status(415).json({ error: e.message });
    if (e instanceof SafeFetchError) return res.status(422).json({ error: e.message });
    console.error('image-proxy failed:', e instanceof Error ? e.message : e);
    return res.status(502).json({ error: 'Could not load the image' });
  }
}
