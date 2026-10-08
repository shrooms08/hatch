// Static picture of the browser buddy (design/v1 ChickenOrb): 11x11 dots, chicken or egg.
// Web illustration only; the extension's live orb is its own engine.
import { cn } from '@/lib/utils';

const CHICKEN = ['......EE...', '.....SSSS..', '.....SNSSY.', 'S....SSSSYY', 'SS..SSSSS..', 'SSSSSSSSS..', 'SSSSSSSSS..', '.SSSSSSSS..', '..SSSSSS...', '....Y.Y....', '...YY.YY...'];
const EGG = ['....SSS....', '...SSSSS...', '..SSSSSSS..', '..SSSSSSS..', '.SSSYYYSSS.', '.SSYYYYYSS.', '.SSYYYYYSS.', '.SSSYYYSSS.', '..SSSSSSS..', '...SSSSS...', '...........'];
const COLOR: Record<string, string> = { '.': 'rgba(246,238,220,0.07)', S: '#F6EEDC', Y: '#F2A93B', E: '#E8572A', N: '#120E0B' };

export function ChickenOrb({ size = 120, mood = 'chicken', className }: { size?: number; mood?: 'chicken' | 'egg'; className?: string }) {
  const cell = (size * 0.56) / 11;
  const s = +(cell * 0.74).toFixed(2);
  const gap = +(cell * 0.26).toFixed(2);
  const dots = (mood === 'egg' ? EGG : CHICKEN).join('').split('');
  return (
    <div
      aria-hidden
      className={cn('flex shrink-0 items-center justify-center rounded-full border border-[#4A3E34]', className)}
      style={{
        width: size,
        height: size,
        background: 'radial-gradient(circle at 35% 28%, #2C241E 0%, #120E0B 72%)',
        boxShadow: `0 14px 36px rgba(0,0,0,0.55), 0 0 0 ${Math.max(2, Math.round(size / 24))}px rgba(242,169,59,0.10)`,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(11, ${s}px)`, gap }}>
        {dots.map((c, i) => (
          <div key={i} style={{ width: s, height: s, borderRadius: '50%', background: COLOR[c] }} />
        ))}
      </div>
    </div>
  );
}
