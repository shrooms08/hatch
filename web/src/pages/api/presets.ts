// GET /api/presets: which presets are enabled and their (public) DBC config keys.
import type { NextApiRequest, NextApiResponse } from 'next';
import { NETWORK } from '@/lib/config/network';
import { loadPresetConfigs, PresetError } from '@/lib/server/presets';
import type { PresetConfigMap } from '@/lib/presets';

export type PresetsResponse = { network: string; configs: PresetConfigMap };

export default function handler(req: NextApiRequest, res: NextApiResponse<PresetsResponse | { error: string }>) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.status(200).json({ network: NETWORK, configs: loadPresetConfigs() });
  } catch (e) {
    return res.status(500).json({ error: e instanceof PresetError ? e.message : 'Preset configuration error' });
  }
}
