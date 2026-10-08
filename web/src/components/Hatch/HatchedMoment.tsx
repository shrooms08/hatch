// Full-screen "Hatched!" moment shown right after a launch confirms (design/v1 Hatched States, 04).
import { useMemo } from 'react';
import { Button, EGG_RADIUS, IconButton, Modal, XIcon } from '@/components/ds';
import { shortAddr } from '@/components/ds/Pill';
import { TokenArt } from '@/components/ds/TokenArt';
import type { PresetId } from '@/lib/presets';
import { ShareActions } from './ShareActions';

const COLORS = ['#E8572A', '#F2A93B', '#FFBD57', '#F6EEDC'];

function useConfetti(n = 34) {
  return useMemo(() => {
    let seed = 7;
    const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    return Array.from({ length: n }, (_, i) => {
      const a = rnd() * Math.PI * 2;
      const d = 180 + rnd() * 420;
      return {
        left: `calc(50% + ${Math.round(Math.cos(a) * d * 1.3)}px)`,
        top: `calc(42% + ${Math.round(Math.sin(a) * d * 0.8)}px)`,
        size: 6 + Math.round(rnd() * 12),
        radius: i % 3 ? '50%' : '3px',
        color: COLORS[i % 4],
        rot: Math.round(rnd() * 90),
        delay: Math.round(rnd() * 400),
      };
    });
  }, [n]);
}

export function HatchedMoment({
  open,
  name,
  symbol,
  mint,
  paired,
  preset,
  stockTicker,
  shield,
  onView,
  onClose,
}: {
  open: boolean;
  name: string;
  symbol: string;
  mint: string;
  paired?: string | null;
  preset: PresetId;
  stockTicker?: string | null;
  shield?: boolean;
  onView: () => void;
  onClose: () => void;
}) {
  const confetti = useConfetti();
  const shell = 'polygon(0 0,100% 0,100% 42%,84% 52%,70% 40%,55% 54%,40% 41%,26% 53%,12% 42%,0 50%)';
  const base = 'polygon(0 50%,12% 42%,26% 53%,40% 41%,55% 54%,70% 40%,84% 52%,100% 42%,100% 100%,0 100%)';
  return (
    <Modal open={open} onClose={onClose} label={`${name} hatched`} fullscreen>
      <div className="relative flex h-full w-full animate-fade-in flex-col items-center justify-center overflow-hidden bg-night px-4 text-center">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(232,87,42,0.55)_0%,rgba(232,87,42,0.16)_28%,rgba(18,14,11,0)_55%)]" />
        <div
          aria-hidden
          className="absolute left-1/2 top-[42%] h-[220vmax] w-[220vmax] -translate-x-1/2 -translate-y-1/2 motion-safe:animate-rays-spin"
          style={{
            background: 'repeating-conic-gradient(from 0deg at 50% 50%, rgba(242,169,59,0.10) 0deg 4deg, rgba(0,0,0,0) 4deg 18deg)',
            maskImage: 'radial-gradient(circle at 50% 50%, #000 0%, transparent 24%)',
            WebkitMaskImage: 'radial-gradient(circle at 50% 50%, #000 0%, transparent 24%)',
          }}
        />
        {confetti.map((c, i) => (
          <span
            key={i}
            aria-hidden
            className="absolute motion-safe:animate-pop-in"
            style={{ left: c.left, top: c.top, width: c.size, height: c.size, borderRadius: c.radius, background: c.color, transform: `rotate(${c.rot}deg)`, animationDelay: `${300 + c.delay}ms` }}
          />
        ))}
        <IconButton label="Close" onClick={onClose} className="absolute right-4 top-4 border-line-strong text-ink-2 md:right-8 md:top-7">
          <XIcon size={14} />
        </IconButton>

        <div className="relative h-[300px] w-[320px] scale-[0.8] md:h-[400px] md:w-[420px] md:scale-100" aria-hidden>
          <div
            className="absolute left-[105px] top-5 h-[262px] w-[210px] bg-shell shadow-[inset_-14px_-18px_0_rgba(0,0,0,0.08)] motion-safe:animate-shell-top"
            style={{ borderRadius: EGG_RADIUS, clipPath: shell, transform: 'translate(-26px,-60px) rotate(-16deg)' }}
          />
          <div className="absolute left-[105px] top-[90px] h-[262px] w-[210px] bg-shell shadow-[inset_-14px_-18px_0_rgba(0,0,0,0.1)]" style={{ borderRadius: EGG_RADIUS, clipPath: base }} />
          <div className="absolute left-[130px] top-24 rounded-[26px] shadow-glow-ember motion-safe:animate-pop-in [animation-delay:350ms]">
            <TokenArt ticker={symbol} seed={symbol} paired={paired} size={160} radius={26} />
          </div>
        </div>

        <div className="relative -mt-2.5 flex flex-col items-center gap-[18px]">
          <h2 className="font-display text-[64px] font-bold leading-[0.9] tracking-[-0.05em] text-ink motion-safe:animate-rise-in md:text-[128px]">
            Hatched<span className="text-ember">!</span>
          </h2>
          <p className="max-w-[560px] text-base leading-normal text-ink-2 md:text-[19px]">
            {name} is live on Solana and incubating. Share it so the first buyers can fill the egg.
          </p>
          <span className="inline-flex h-8 items-center gap-2 rounded-pill border border-line bg-surface-2 px-3 font-mono text-[13px] font-medium text-ink-2">
            ${symbol} · {shortAddr(mint)}
          </span>
          <div className="mt-2.5 flex flex-col items-center gap-3 sm:flex-row">
            <Button variant="ember" data-autofocus onClick={onView} className="h-[58px] px-[30px] text-base shadow-[0_0_48px_rgba(232,87,42,0.45)]">
              View my token
            </Button>
            <ShareActions
              mint={mint}
              info={{ symbol, preset, stockTicker, shield, creator: true }}
              label="Share your hatch"
              className="justify-center"
              size="md"
              buttonClassName="h-[58px] px-6 text-base bg-surface-1/80"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
