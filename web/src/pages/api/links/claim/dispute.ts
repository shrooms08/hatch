// POST /api/links/claim/dispute { mint, contact, reason }: dispute the open claim on a coin (shown to the approver).
import { linkRoute } from '@/lib/server/links/route';
import { disputeClaim } from '@/lib/server/links/claims';

export default linkRoute({ method: 'POST', bucket: 'claim-dispute', limit: 5, windowMs: 60 * 60_000 }, async (req) => disputeClaim((req.body ?? {}) as Record<string, unknown>));
