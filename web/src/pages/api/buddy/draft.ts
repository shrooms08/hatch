// POST /api/buddy/draft: AI drafts a token from a page context (+ chat history for refinements).
// Output is validated and clamped server-side; nothing is launched.
import type { NextApiRequest, NextApiResponse } from 'next';
import { draftRequestSchema, type BuddyDraft } from '@/lib/buddy/schema';
import { AiOutputError, draftToken } from '@/lib/server/buddy';
import { aiErrorResponse } from '@/lib/server/ai';
import { handleCors } from '@/lib/server/cors';
import { rateLimited } from '@/lib/server/rateLimit';
import { uploadFallbackImage } from '@/lib/server/fallbackImage';
import { isR2Configured } from '@/lib/server/r2';
import { loadHatchConfigs } from '@/lib/server/presets';

/** No usable image on the page: give the draft the generated Hatch egg (best effort). */
async function withFallbackImage(draft: BuddyDraft): Promise<BuddyDraft> {
  if (draft.imageUrl || !isR2Configured()) return draft;
  try {
    const paired = draft.preset === 'STOCK' && draft.stockTicker ? loadHatchConfigs().stocks[draft.stockTicker]?.symbol : null;
    return { ...draft, imageUrl: await uploadFallbackImage(draft.symbol, paired) };
  } catch (e) {
    console.error('fallback image failed:', e instanceof Error ? e.message : e);
    return draft;
  }
}

export const config = { api: { bodyParser: { sizeLimit: '256kb' } } };

const DRAFTS_PER_HOUR = 20;

export default async function handler(req: NextApiRequest, res: NextApiResponse<BuddyDraft | { error: string; issues?: unknown }>) {
  if (handleCors(req, res, ['POST'])) return;
  const parsed = draftRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid request', issues: parsed.error.flatten().fieldErrors });
  if (rateLimited(req, res, 'draft', DRAFTS_PER_HOUR)) return;

  try {
    return res.status(200).json(await withFallbackImage(await draftToken(parsed.data)));
  } catch (error) {
    if (error instanceof AiOutputError) return res.status(502).json({ error: error.message });
    const { status, error: message } = aiErrorResponse(error);
    if (status >= 500 && status !== 503) console.error('buddy/draft failed:', error instanceof Error ? error.message : error);
    return res.status(status).json({ error: message });
  }
}
