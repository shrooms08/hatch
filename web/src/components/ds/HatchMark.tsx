// The meteor-egg mark (design/v1 HatchMark): the yolk is the meteor, the egg white wraps it and
// stretches into the trail, with two thick trail strokes. Legible down to 16px.
import { cn } from '@/lib/utils';

export type MarkVariant = 'dark' | 'light' | 'yolk' | 'auto';

const COLORS: Record<Exclude<MarkVariant, 'auto'>, [string, string]> = {
  dark: ['#F6EEDC', '#F2A93B'], // on Night
  light: ['#120E0B', '#F2A93B'], // on Shell
  yolk: ['#120E0B', '#F6EEDC'], // on a Yolk tile
};

export function HatchMark({ size = 32, variant = 'auto', className }: { size?: number; variant?: MarkVariant; className?: string }) {
  // auto: body follows the theme's primary text colour (Shell on dark, Night on light).
  const [body, yolk] = variant === 'auto' ? ['rgb(var(--text-primary))', '#F2A93B'] : COLORS[variant];
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden className={cn('block shrink-0', className)}>
      <g transform="translate(-3.5 3.5)">
        <path
          d="M0 -40 L13.9 -5.6 A15 15 0 1 1 -13.9 -5.6 Z"
          transform="translate(24 40) rotate(45)"
          fill={body}
          stroke={body}
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <circle cx="24" cy="40" r="9" fill={yolk} />
        <path d="M53 35 L61.5 26.5 M27.6 12.4 L36 4" stroke={body} strokeWidth="6" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** Lockup: mark height = 1.3 x cap height, gap = 0.35 x mark. */
export function HatchLogo({ size = 30, className, wordClassName }: { size?: number; className?: string; wordClassName?: string }) {
  return (
    <span className={cn('inline-flex items-center', className)} style={{ gap: Math.round(size * 0.4) }}>
      <HatchMark size={size} />
      <span
        className={cn('font-display font-bold tracking-[-0.02em] text-ink', wordClassName)}
        style={{ fontSize: Math.round(size * 0.7) }}
      >
        Hatch
      </span>
    </span>
  );
}
