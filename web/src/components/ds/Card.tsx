import { cn } from '@/lib/utils';
import { WarnIcon } from './icons';

/** Cards: radius lg (20), surface-1, 1px surface-3 border. */
export function Card({ className, children, as: As = 'div', ...props }: React.HTMLAttributes<HTMLElement> & { as?: 'div' | 'section' | 'article' }) {
  return (
    <As className={cn('rounded-lg border border-surface-3 bg-surface-1', className)} {...props}>
      {children}
    </As>
  );
}

/** Mono overline label: 11-12px, tracked, ash. */
export function Overline({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn('font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted', className)}>{children}</span>;
}

/** Explainer note: inset surface, title + body. */
export function Note({ title, children, className }: { title?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-2 rounded-[16px] border border-surface-3 bg-inset p-[18px]', className)}>
      {title && <span className="text-[15px] font-semibold text-ink">{title}</span>}
      <div className="text-sm leading-[1.55] text-ink-2">{children}</div>
    </div>
  );
}

/** Honest note (warning tint), e.g. "This token is not the stock…". */
export function HonestNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex gap-3 rounded-[16px] border border-warning/30 bg-warning/[0.08] px-[18px] py-4', className)} role="note">
      <WarnIcon size={18} className="mt-px shrink-0 text-warning" />
      <span className="text-sm leading-normal text-ink">{children}</span>
    </div>
  );
}

/** Skeleton: surface-2 -> surface-3 shimmer. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-shimmer rounded-pill bg-[linear-gradient(90deg,rgb(var(--surface-2))_0%,rgb(var(--surface-3))_50%,rgb(var(--surface-2))_100%)] bg-[length:200%_100%]',
        className
      )}
    />
  );
}

/** The 32px dot field used behind heroes and token art. */
export function DotField({ className, opacity = 0.06 }: { className?: string; opacity?: number }) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0', className)}
      style={{
        backgroundImage: `radial-gradient(rgb(var(--dot-field) / ${opacity}) 1px, transparent 1px)`,
        backgroundSize: '24px 24px',
      }}
    />
  );
}
