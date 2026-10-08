// GET /api/fallback-image?symbol=&stock=: preview of the image a launch gets when it has none.
import type { NextApiRequest, NextApiResponse } from 'next';
import { renderFallbackPng } from '@/lib/server/fallbackImage';
import { loadHatchConfigs } from '@/lib/server/presets';
import { rateLimited } from '@/lib/server/rateLimit';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Rendering is CPU work: cap it per IP (the preview re-renders as the ticker is typed).
  if (rateLimited(req, res, 'fallback-image', 60, 60_000)) return;
  const symbol = String(req.query.symbol ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  const stock = String(req.query.stock ?? '').toUpperCase();
  const paired = stock ? loadHatchConfigs().stocks[stock]?.symbol : null;
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.status(200).send(renderFallbackPng(symbol || 'HATCH', paired));
}
