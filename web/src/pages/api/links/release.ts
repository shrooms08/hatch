// POST /api/links/release { canonicalId, mint, token } -> { released: true }: frees a link the caller reserved when
// their hatch cannot land (wallet rejected, popup closed, send refused before broadcast). Needs the reservation's token;
// refused once a pool exists on chain.
import { linkRoute } from '@/lib/server/links/route';
import { releaseReservation } from '@/lib/server/links/service';

export default linkRoute({ method: 'POST', bucket: 'links-release', limit: 30, windowMs: 10 * 60_000 }, (req) => releaseReservation((req.body ?? {}) as Record<string, unknown>));
