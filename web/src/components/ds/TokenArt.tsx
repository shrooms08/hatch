// The generated token art (design/v1 TokenArt), as DOM: used for previews (Hatch a token) and as the
// fallback avatar when a token has no image. The server renders the same template as a 512px PNG
// (lib/server/fallbackImage.ts).
import { cn } from '@/lib/utils';
import { HatchMark } from './HatchMark';
import { EGG_RADIUS } from './Progress';

/** The six egg tones. Seeded by ticker, so the form preview matches the image the server generates. */
export const EGG_TONES = ['#F2A93B', '#E8572A', '#F6EEDC', '#7BD389', '#8DB4FF', '#FFBD57'] as const;

export function toneFor(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return EGG_TONES[(h >>> 0) % EGG_TONES.length];
}

export const tickerFontSize = (ticker: string) => {
  const L = ticker.length;
  return L <= 4 ? 118 : L === 5 ? 100 : L === 6 ? 86 : L === 7 ? 74 : 62;
};

export function TokenArt({
  ticker,
  seed,
  paired,
  size = 512,
  radius,
  className,
}: {
  ticker: string;
  seed?: string;
  /** e.g. "NVDAx" for stock-paired launches; omitted -> "hatched on Solana". */
  paired?: string | null;
  size?: number;
  radius?: number;
  className?: string;
}) {
  const t = (ticker || 'HATCH').toUpperCase().slice(0, 10);
  const tone = toneFor(seed || t);
  const scale = size / 512;
  return (
    <div
      aria-hidden
      className={cn('relative shrink-0 overflow-hidden bg-night', className)}
      style={{ width: size, height: size, borderRadius: radius ?? Math.round(size * 0.16) }}
    >
      <div
        className="absolute left-0 top-0 h-[512px] w-[512px] origin-top-left"
        style={{
          transform: `scale(${scale})`,
          backgroundColor: '#120E0B',
          backgroundImage: 'radial-gradient(rgba(246,238,220,0.10) 2px, transparent 2px)',
          backgroundSize: '32px 32px',
        }}
      >
        <div className="absolute left-9 top-[34px] flex items-center gap-2.5">
          <HatchMark size={34} variant="dark" />
          <span className="font-mono text-[20px] font-semibold tracking-[0.14em] text-[#8A8178]">HATCH</span>
        </div>
        <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 38%, ${tone}33 0%, rgba(18,14,11,0) 55%)` }} />
        <div
          className="absolute left-[151px] top-[70px] h-[262px] w-[210px]"
          style={{ borderRadius: EGG_RADIUS, background: tone, boxShadow: 'inset -18px -22px 0 rgba(0,0,0,0.14), 0 24px 48px rgba(0,0,0,0.5)' }}
        />
        <div className="absolute left-[190px] top-[122px] h-24 w-14 rotate-[16deg] rounded-full border-l-[13px] border-white/60" />
        <div
          className="absolute inset-x-0 top-[352px] text-center font-display font-bold leading-none tracking-[-0.035em] text-[#F6EEDC]"
          style={{ fontSize: tickerFontSize(t) }}
        >
          {t}
        </div>
        {paired ? (
          <div className="absolute inset-x-0 bottom-[30px] flex justify-center">
            <span className="flex h-[42px] items-center rounded-pill border-2 border-[#F2A93B] px-5 font-mono text-[21px] font-medium text-[#F2A93B]">
              paired with {paired}
            </span>
          </div>
        ) : (
          <div className="absolute inset-x-0 bottom-10 text-center font-mono text-[21px] font-medium tracking-[0.04em] text-[#8A8178]">hatched on Solana</div>
        )}
      </div>
    </div>
  );
}
