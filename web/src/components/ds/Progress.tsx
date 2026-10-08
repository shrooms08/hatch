// Hatching progress: the shell bar + mini egg, and the big egg vessel on the token page.
// The bar and egg fill with yolk. From 80% the fill warms toward ember and the egg cracks.
// At 100% it turns fully ember. A tiny value always shows at least a 4px sliver.
import { ALMOST_HATCHED_AT } from '@/lib/dbc/pool';
import { cn } from '@/lib/utils';

export const EGG_RADIUS = '50% 50% 50% 50% / 60% 60% 40% 40%';

/** 0 incubating · 1 almost (>= 80%) · 2 hatched (100% or migrated). */
export function stageOf(progress: number, hatched = false): 0 | 1 | 2 {
  if (hatched || progress >= 1) return 2;
  return progress >= ALMOST_HATCHED_AT ? 1 : 0;
}

const FILL = ['#F2A93B', 'linear-gradient(90deg,#F2A93B,#FF6E3F)', '#E8572A'];
const INK = ['text-ink-2', 'text-yolk-hi', 'text-ember'];
const EGG_BORDER = ['border-line-strong', 'border-yolk', 'border-ember'];

export const progressInk = (progress: number, hatched = false) => INK[stageOf(progress, hatched)];

export function ShellBar({ progress, hatched = false, height = 10, className }: { progress: number; hatched?: boolean; height?: number; className?: string }) {
  const s = stageOf(progress, hatched);
  const pct = Math.min(100, Math.max(0, (hatched ? 1 : progress) * 100));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Number(pct.toFixed(2))}
      aria-label="Hatching progress"
      className={cn('w-full overflow-hidden rounded-pill bg-surface-3', className)}
      style={{ height }}
    >
      <div
        className="h-full rounded-pill transition-[width] duration-700 ease-out"
        style={{ width: `max(4px, ${pct}%)`, background: FILL[s] }}
      />
    </div>
  );
}

export function MiniEgg({ progress, hatched = false, className }: { progress: number; hatched?: boolean; className?: string }) {
  const s = stageOf(progress, hatched);
  const h = Math.max((hatched ? 1 : progress) * 100, 8);
  return (
    <div aria-hidden className={cn('relative h-[30px] w-6 shrink-0 overflow-hidden border-2', EGG_BORDER[s], className)} style={{ borderRadius: EGG_RADIUS }}>
      <div className="absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-out" style={{ height: `${h}%`, background: FILL[s] }} />
    </div>
  );
}

/**
 * The big egg on the token page: a dark shell that fills with yolk from the bottom. The yolk line
 * glows; past 80% a crack appears; scale marks run down the right side.
 */
export function EggVessel({ progress, hatched = false, className }: { progress: number; hatched?: boolean; className?: string }) {
  const s = stageOf(progress, hatched);
  const pct = Math.min(1, Math.max(0, hatched ? 1 : progress));
  // Fill height in px of a 330px egg, with a 5px minimum so a tiny raise still shows.
  const fill = Math.max(5, pct * 330);
  return (
    <div className={cn('relative flex h-[380px] items-center justify-center', className)}>
      <div
        className={cn('relative h-[330px] w-[260px] overflow-hidden border-[3px] bg-night', s === 0 ? 'border-line-strong' : s === 1 ? 'border-yolk' : 'border-ember')}
        style={{ borderRadius: EGG_RADIUS, boxShadow: 'inset -20px -24px 0 rgba(0,0,0,0.25)' }}
      >
        <div
          className="absolute inset-x-0 bottom-0 transition-[height] ease-out"
          style={{
            height: fill,
            transitionDuration: "1200ms",
            background: s === 2 ? '#E8572A' : s === 1 ? 'linear-gradient(180deg,#FF6E3F,#F2A93B 60%)' : '#F2A93B',
            boxShadow: s === 2 ? '0 -6px 22px rgba(232,87,42,0.6)' : '0 -6px 18px rgba(242,169,59,0.6)',
          }}
        />
        <div
          className="absolute left-[52px] top-[62px] h-[84px] w-11 rotate-[16deg] rounded-full border-l-[8px] border-shell/[0.12]"
          aria-hidden
        />
        {s >= 1 && (
          <svg viewBox="0 0 260 330" className="absolute inset-0 h-full w-full" aria-hidden>
            <path
              d="M70 92 L96 118 L84 140 L112 162 L104 186"
              fill="none"
              stroke={s === 2 ? '#120E0B' : '#F6EEDC'}
              strokeOpacity={s === 2 ? 0.55 : 0.5}
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      <div className="absolute bottom-[30px] right-[-6px] top-10 flex flex-col justify-between text-right font-mono text-[11px] font-medium text-ink-disabled" aria-hidden>
        <span>100</span>
        <span className="text-ink-accent">80 · crack</span>
        <span>50</span>
        <span>25</span>
        <span>0</span>
      </div>
    </div>
  );
}

/** Small outline egg used in the stage timeline (filled when current, dashed when upcoming). */
export function StageEgg({ state }: { state: 'done' | 'current' | 'next' }) {
  return (
    <div
      aria-hidden
      className={cn(
        'h-[38px] w-[30px] shrink-0 border-2',
        state === 'next' ? 'border-dashed border-ink-muted' : state === 'current' ? 'border-yolk bg-yolk/15' : 'border-ember bg-ember/20'
      )}
      style={{ borderRadius: EGG_RADIUS }}
    />
  );
}
