// POST /api/buddy/notice: fast-model check whether a locally-flagged page is worth a hint.
import type { NextApiRequest, NextApiResponse } from 'next';
import { noticeRequestSchema, type BuddyNotice } from '@/lib/buddy/schema';
import { AiOutputError, noticePage } from '@/lib/server/buddy';
import { aiErrorResponse } from '@/lib/server/ai';
import { handleCors } from '@/lib/server/cors';
import { dailyCapReached, rateLimited } from '@/lib/server/rateLimit';

const NOTICES_PER_HOUR = process.env.NODE_ENV === 'production' ? 30 : 120; // per IP

export default async function handler(req: NextApiRequest, res: NextApiResponse<BuddyNotice | { error: string; issues?: unknown }>) {
  if (handleCors(req, res, ['POST'])) return;
  const parsed = noticeRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid request', issues: parsed.error.flatten().fieldErrors });
  if (rateLimited(req, res, 'notice', NOTICES_PER_HOUR)) return;
  if (dailyCapReached(res, 'notice')) return;

  try {
    return res.status(200).json(await noticePage(parsed.data));
  } catch (error) {
    if (error instanceof AiOutputError) return res.status(502).json({ error: error.message });
    const { status, error: message } = aiErrorResponse(error);
    return res.status(status).json({ error: message });
  }
}
