import { PRESETS, type PresetId } from '@/lib/presets';

export function PresetExplainer({ preset }: { preset: PresetId }) {
  const p = PRESETS[preset];
  return (
    <div className="rounded-lg border border-neutral-750 bg-neutral-900/60 p-4">
      <h3 className="mb-2 text-sm font-semibold text-neutral-200">How a {p.label} launch works</h3>
      <ul className="space-y-1.5 text-sm text-neutral-300">
        {p.explainer.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
