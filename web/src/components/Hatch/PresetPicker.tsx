import { cn } from '@/lib/utils';
import { PRESET_IDS, PRESETS, type PresetConfigMap, type PresetId } from '@/lib/presets';

type Props = {
  value: PresetId;
  onChange: (id: PresetId) => void;
  /** Presets enabled on the server; others are shown disabled. */
  enabled: PresetConfigMap | undefined;
};

export function PresetPicker({ value, onChange, enabled }: Props) {
  return (
    <div role="radiogroup" aria-label="Launch preset" className="grid grid-cols-1 gap-3 md:grid-cols-3">
      {PRESET_IDS.map((id) => {
        const preset = PRESETS[id];
        const isEnabled = !enabled || !!enabled[id];
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={!isEnabled}
            onClick={() => onChange(id)}
            className={cn(
              'rounded-lg border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40',
              selected ? 'border-primary/70 bg-primary/10' : 'border-neutral-750 hover:border-neutral-600'
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">{preset.label}</span>
              <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-xs text-neutral-400">
                {preset.quoteSymbol}
              </span>
            </div>
            <p className="mt-1 text-xs text-neutral-400">{preset.description}</p>
            {!isEnabled && <p className="mt-1 text-xs text-rose">Not enabled on this server</p>}
          </button>
        );
      })}
    </div>
  );
}
