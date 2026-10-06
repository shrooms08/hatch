// GET /api/stocks: tokenized stocks Hatch can pair with on the current network (ticker -> xStock).
// The extension reads this instead of a hardcoded table; anything not listed is "coming soon".
import type { NextApiRequest, NextApiResponse } from 'next';
import { loadHatchConfigs, PresetError } from '@/lib/server/presets';
import type { StockMap } from '@/lib/presets';
import { handleCors } from '@/lib/server/cors';

export type StocksResponse = { network: string; stocks: StockMap };

export default function handler(req: NextApiRequest, res: NextApiResponse<StocksResponse | { error: string }>) {
  if (handleCors(req, res, ['GET'])) return;
  try {
    const { network, stocks } = loadHatchConfigs();
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.status(200).json({ network, stocks });
  } catch (e) {
    return res.status(500).json({ error: e instanceof PresetError ? e.message : 'Stock configuration error' });
  }
}
