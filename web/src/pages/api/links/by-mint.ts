// GET /api/links/by-mint?mint=<base mint> -> the link a coin is for ({ canonicalId, displayUrl, owner..., status })
// or null. Public information (the coin's on-chain metadata already names the link).
import { PublicKey } from '@solana/web3.js';
import { linkRoute } from '@/lib/server/links/route';
import { LinkApiError, linkForMint } from '@/lib/server/links/service';

export default linkRoute({ method: 'GET', bucket: 'links-by-mint', limit: 240, windowMs: 60_000 }, async (req, res) => {
  let mint: string;
  try {
    mint = new PublicKey(String(req.query.mint ?? '')).toBase58();
  } catch {
    throw new LinkApiError(400, 'mint is invalid');
  }
  const link = await linkForMint(mint);
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
  return { link };
});
