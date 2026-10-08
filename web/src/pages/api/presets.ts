// GET /api/presets: the network's launch configs (MEME / AI_AGENT keys, the per-ticker stock map,
// hidden test mints) and the preset copy, so the web app and extension show the same text.
import type { NextApiRequest, NextApiResponse } from 'next';
import { enabledPresets, loadHatchConfigs, PresetError } from '@/lib/server/presets';
import { PRESETS, stockPreset, type HatchConfigs, type Preset } from '@/lib/presets';
import { handleCors } from '@/lib/server/cors';

export type PresetsResponse = HatchConfigs & {
  presets: Pick<Preset, 'id' | 'label' | 'description' | 'quoteSymbol' | 'explainer'>[];
};

export default function handler(req: NextApiRequest, res: NextApiResponse<PresetsResponse | { error: string }>) {
  if (handleCors(req, res, ['GET'])) return;
  try {
    const hc = loadHatchConfigs();
    const firstStock = Object.values(hc.stocks)[0];
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(200).json({
      ...hc,
      // Only presets that can launch here (the extension offers exactly these).
      presets: enabledPresets(hc).map((id) => {
        const p = id === 'STOCK' ? stockPreset(firstStock) : PRESETS[id];
        return { id, label: p.label, description: p.description, quoteSymbol: p.quoteSymbol, explainer: p.explainer };
      }),
    });
  } catch (e) {
    return res.status(500).json({ error: e instanceof PresetError ? e.message : 'Preset configuration error' });
  }
}
