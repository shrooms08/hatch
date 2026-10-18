// POST /api/links/hatch { url, wallet, name, ticker, imageUrl?, firstBuySol } -> { transaction (base64, partially
// signed), mint, pool, canonicalId, reservedUntil }. The wallet signs and sends it, then calls /api/links/confirm.
// One transaction: a one-time key creates the pool under the LINK config, the wallet pays and makes the first
// buy, and the pool creator role moves to the Hatch Squads vault. The link is reserved for 120 s meanwhile.
import { linkRoute } from '@/lib/server/links/route';
import { hatchLink } from '@/lib/server/links/service';
import { clientIp } from '@/lib/server/rateLimit';

export const config = { api: { bodyParser: { sizeLimit: '16kb' } } };

export default linkRoute({ method: 'POST', bucket: 'links-hatch', limit: 20, windowMs: 60 * 60_000 }, (req) => hatchLink(req.body ?? {}, { ip: clientIp(req) }));
