// GET /api/og/<mint>: the token's 1200x630 share card (Open Graph / X summary_large_image).
// Cached 5 minutes at the CDN; progress in the card is at most that old.
import type { NextApiRequest, NextApiResponse } from 'next';
import { PublicKey } from '@solana/web3.js';
import { getTokenCard, renderTokenCardPng } from '@/lib/server/tokenCard';
import { rateLimited } from '@/lib/server/rateLimit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const mint = String(req.query.mint ?? '').replace(/\.png$/, '');
  try {
    new PublicKey(mint);
  } catch {
    return res.status(400).json({ error: 'mint is not a valid address' });
  }
  // Chain reads + rendering: the CDN serves repeats, this caps cache misses per IP.
  if (rateLimited(req, res, 'og', 30, 60_000)) return;
  try {
    const card = await getTokenCard(mint);
    if (!card) return res.status(404).json({ error: 'No metadata for this mint' });
    const png = await renderTokenCardPng(card);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).send(png);
  } catch (e) {
    console.error('og image failed:', e instanceof Error ? e.message : e);
    return res.status(502).json({ error: 'Could not render the image' });
  }
}
