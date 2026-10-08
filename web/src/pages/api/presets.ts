// GET /api/presets: the network's launch configs (MEME / AI_AGENT keys, the per-ticker stock map,
// hidden test mints) and the preset copy, so the web app and extension show the same text.
import type { NextApiRequest, NextApiResponse } from 'next';
import { enabledPresets, loadHatchConfigs, PresetError } from '@/lib/server/presets';
import { PRESETS, stockPreset, type HatchConfigs, type Preset } from '@/lib/presets';
import { handleCors } from '@/lib/server/cors';
import { presetCopies } from '@/lib/server/presetCopy';
import type { PresetCopy } from '@/lib/presets/copy';

export type PresetsResponse = HatchConfigs & {
  presets: Pick<Preset, 'id' | 'label' | 'description' | 'quoteSymbol' | 'explainer'>[];
  /** Launch copy per config (MEME, AI_AGENT, STOCK:<TICKER>), read from chain: same text as the launch form. */
  copy: Record<string, PresetCopy>;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse<PresetsResponse | { error: string }>) {
  if (handleCors(req, res, ['GET'])) return;
  try {
    const hc = loadHatchConfigs();
    const firstStock = Object.values(hc.stocks)[0];
    const copy = await presetCopies(hc).catch((): Record<string, PresetCopy> => ({}));
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(200).json({
      ...hc,
      // Only presets that can launch here (the extension offers exactly these).
      presets: enabledPresets(hc).map((id) => {
        const p = id === 'STOCK' ? stockPreset(firstStock) : PRESETS[id];
        return { id, label: p.label, description: p.description, quoteSymbol: p.quoteSymbol, explainer: p.explainer };
      }),
      copy,
    });
  } catch (e) {
    return res.status(500).json({ error: e instanceof PresetError ? e.message : 'Preset configuration error' });
  }
}
