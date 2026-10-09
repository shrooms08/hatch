// GET /actions.json (rewritten here in next.config): maps token pages to the buy Action, so a plain
// https://hatchfun.vercel.app/token/<mint> link unfurls as a Blink in Action-aware clients.
import type { NextApiRequest, NextApiResponse } from 'next';
import { ACTIONS_JSON, actionHeaders } from '@/lib/server/actions';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  for (const [k, v] of Object.entries(actionHeaders())) res.setHeader(k, v);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ message: 'Method not allowed' });
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).json(ACTIONS_JSON);
}
