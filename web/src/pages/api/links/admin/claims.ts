// GET  /api/links/admin/claims                         -> claims for review (approver wallet only, signed message)
// POST /api/links/admin/claims { op: 'vote', claimId, vote: 'approve'|'reject' } -> unsigned vote tx for the wallet
// POST /api/links/admin/claims { op: 'sync', claimId, signature? } -> after the vote: execute + verify, or close
// Headers: x-hatch-wallet, x-hatch-ts, x-hatch-sig (the wallet's signature of ADMIN_MESSAGE(ts)).
import { linkRoute } from '@/lib/server/links/route';
import { LinkApiError } from '@/lib/server/links/service';
import { adminClaims, adminVoteTx, assertAdmin, syncClaim } from '@/lib/server/links/claims';

const admin = (h: Record<string, string | string[] | undefined>) => assertAdmin({ wallet: h['x-hatch-wallet'], ts: h['x-hatch-ts'], sig: h['x-hatch-sig'] });

const getHandler = linkRoute({ method: 'GET', bucket: 'claim-admin', limit: 120, windowMs: 60_000 }, async (req, res) => {
  admin(req.headers);
  res.setHeader('Cache-Control', 'no-store');
  return { claims: await adminClaims() };
});
const postHandler = linkRoute({ method: 'POST', bucket: 'claim-admin-post', limit: 60, windowMs: 60_000 }, async (req) => {
  const approver = admin(req.headers);
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (body.op === 'vote') return adminVoteTx(approver, body);
  if (body.op === 'sync') return syncClaim(body.claimId, body.signature);
  throw new LinkApiError(400, 'op must be vote or sync');
});

export default function handler(req: Parameters<typeof getHandler>[0], res: Parameters<typeof getHandler>[1]) {
  return req.method === 'POST' ? postHandler(req, res) : getHandler(req, res);
}
