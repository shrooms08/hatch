// Static picture of the browser buddy (design/v1 ChickenOrb): 11x11 dots, chicken or egg.
// Art from lib/buddyArt (shared with the extension's live buddy).
import { ART, CELL_COLOR, CHICKEN, EGG, GRID } from '@/lib/buddyArt';
import { cn } from '@/lib/utils';

export function ChickenOrb({ size = 120, mood = 'chicken', className }: { size?: number; mood?: 'chicken' | 'egg'; className?: string }) {
  const cell = (size * ART.gridRatio) / GRID;
  const s = +(cell * ART.dotRatio).toFixed(2);
  const gap = +(cell * (1 - ART.dotRatio)).toFixed(2);
  const dots = (mood === 'egg' ? EGG : CHICKEN).join('').split('');
  return (
    <div
      aria-hidden
      className={cn('flex shrink-0 items-center justify-center rounded-full border', className)}
      style={{
        width: size,
        height: size,
        borderColor: ART.border,
        background: ART.background,
        boxShadow: `${ART.shadow}, 0 0 0 ${ART.ringWidth(size)}px ${ART.ring}`,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${GRID}, ${s}px)`, gap }}>
        {dots.map((c, i) => (
          <div key={i} style={{ width: s, height: s, borderRadius: '50%', background: CELL_COLOR[c] }} />
        ))}
      </div>
    </div>
  );
}
