// GET /api/presets: enabled presets, their (public) DBC config keys, and the preset copy
// (label, description, explainer) so the extension shows the same text as the web app.
import type { NextApiRequest, NextApiResponse } from 'next';
import { NETWORK } from '@/lib/config/network';
import { loadPresetConfigs, PresetError } from '@/lib/server/presets';
import { PRESET_IDS, PRESETS, type Preset, type PresetConfigMap } from '@/lib/presets';
import { handleCors } from '@/lib/server/cors';

export type PresetsResponse = {
  network: string;
  configs: PresetConfigMap;
  presets: Pick<Preset, 'id' | 'label' | 'description' | 'quoteSymbol' | 'explainer'>[];
};

export default function handler(req: NextApiRequest, res: NextApiResponse<PresetsResponse | { error: string }>) {
  if (handleCors(req, res, ['GET'])) return;
  try {
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(200).json({
      network: NETWORK,
      configs: loadPresetConfigs(),
      presets: PRESET_IDS.map((id) => {
        const { label, description, quoteSymbol, explainer } = PRESETS[id];
        return { id, label, description, quoteSymbol, explainer };
      }),
    });
  } catch (e) {
    return res.status(500).json({ error: e instanceof PresetError ? e.message : 'Preset configuration error' });
  }
}
