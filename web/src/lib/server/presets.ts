// Server-only: the POOL_CONFIGS allowlist ({"MEME":"...","STOCK":"...","AI_AGENT":"..."}).
import { PublicKey } from '@solana/web3.js';
import { PRESET_IDS, type PresetConfigMap, type PresetId } from '@/lib/presets';

export class PresetError extends Error {}

export function loadPresetConfigs(): PresetConfigMap {
  const raw = process.env.POOL_CONFIGS;
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PresetError('POOL_CONFIGS is not valid JSON');
  }
  const out: PresetConfigMap = {};
  for (const id of PRESET_IDS) {
    const value = (parsed as Record<string, unknown>)?.[id];
    if (typeof value !== 'string' || !value) continue;
    try {
      out[id] = new PublicKey(value).toBase58();
    } catch {
      throw new PresetError(`POOL_CONFIGS.${id} is not a valid public key`);
    }
  }
  return out;
}

/** Config key for a preset from the allowlist; throws for unknown or unconfigured presets. */
export function configKeyFor(preset: PresetId): PublicKey {
  const key = loadPresetConfigs()[preset];
  if (!key) throw new PresetError(`Preset ${preset} is not enabled on this server`);
  return new PublicKey(key);
}
