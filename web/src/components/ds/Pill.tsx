import { useState } from 'react';
import type { HatchStatus } from '@/lib/dbc/pool';
import type { PresetId } from '@/lib/presets';
import { cn } from '@/lib/utils';
import { CheckIcon, CopyIcon, CrackedEggGlyph, HalfShellGlyph, SmileIcon, SparkIcon, TrendIcon } from './icons';

const pillBase = 'inline-flex h-7 shrink-0 items-center gap-[7px] whitespace-nowrap rounded-pill px-3 text-xs font-semibold';

/** Incubating (yolk outline) · Almost hatched (solid yolk, cracked egg) · Hatched (solid ember). */
export function StatusPill({ status, className, size = 'md' }: { status: HatchStatus; className?: string; size?: 'md' | 'sm' }) {
  const sm = size === 'sm' ? 'h-6 px-2.5 text-[11px]' : '';
  if (status === 'HATCHED')
    return (
      <span className={cn(pillBase, 'bg-ember text-ink-on-yolk', sm, className)}>
        <HalfShellGlyph size={12} />
        Hatched
      </span>
    );
  if (status === 'ALMOST_HATCHED')
    return (
      <span className={cn(pillBase, 'bg-yolk text-ink-on-yolk', sm, className)}>
        <CrackedEggGlyph size={12} />
        Almost hatched
      </span>
    );
  return (
    <span className={cn(pillBase, 'border border-yolk/35 bg-yolk/[0.12] text-ink-accent', sm, className)}>
      <span className="h-2.5 w-2 rounded-[50%_50%_50%_50%/60%_60%_40%_40%] bg-yolk" />
      Incubating
    </span>
  );
}

const PRESET_META: Record<PresetId, { label: string; icon: React.ReactNode; dot: string }> = {
  STOCK: { label: 'Stock-paired', icon: <TrendIcon size={13} className="text-yolk" />, dot: 'bg-yolk' },
  MEME: { label: 'Meme', icon: <SmileIcon size={13} className="text-ink" />, dot: 'bg-shell' },
  AI_AGENT: { label: 'AI agent', icon: <SparkIcon size={13} className="text-info" />, dot: 'bg-info' },
};

export const presetLabel = (id: PresetId | null | undefined) => (id ? PRESET_META[id].label : 'Unknown');

/** Preset badge with its quote token, e.g. "Stock-paired NVDAx" or "Meme SOL". */
export function PresetBadge({ preset, quote, variant = 'icon', className }: { preset: PresetId | null; quote?: string; variant?: 'icon' | 'dot'; className?: string }) {
  if (!preset) return null;
  const m = PRESET_META[preset];
  return (
    <span className={cn('inline-flex h-7 shrink-0 items-center gap-[7px] whitespace-nowrap rounded-pill border border-line bg-surface-2 px-[11px] text-xs font-medium text-ink-2', className)}>
      {variant === 'dot' ? <span className={cn('h-1.5 w-1.5 rounded-full', m.dot)} /> : m.icon}
      {m.label}
      {quote && <span className={cn('font-mono text-[11px] font-medium', preset === 'STOCK' ? 'text-ink-accent' : 'text-ink-muted')}>{quote}</span>}
    </span>
  );
}

/** Dashed "Inspired by <domain>" chip. */
export function InspiredChip({ domain, href, className }: { domain: string; href?: string; className?: string }) {
  const body = (
    <>
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-3 text-[10px] font-bold uppercase text-success">{domain[0]}</span>
      <span className="text-ink-2">Inspired by</span>
      <span className="truncate text-ink">{domain}</span>
    </>
  );
  const cls = cn(
    'inline-flex h-[30px] min-w-0 max-w-full items-center gap-2 rounded-pill border border-dashed border-line-strong pl-[5px] pr-3 text-xs font-medium',
    href && 'transition-colors hover:border-ink-muted',
    className
  );
  return href ? (
    <a href={href} target="_blank" rel="noreferrer nofollow" className={cls}>
      {body}
    </a>
  ) : (
    <span className={cls}>{body}</span>
  );
}

export const shortAddr = (a: string, head = 10, tail = 4) => (a.length > head + tail + 1 ? `${a.slice(0, head)}…${a.slice(-tail)}` : a);

/** Mono address chip with a copy button. */
export function AddressChip({ address, label, head = 10, className }: { address: string; label?: string; head?: number; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked: nothing to do */
    }
  };
  return (
    <span className={cn('inline-flex h-[30px] shrink-0 items-center gap-2 rounded-pill border border-line bg-surface-2 pl-3 pr-1.5 font-mono text-xs font-medium text-ink-2', className)}>
      {label && <span className="text-ink-muted">{label}</span>}
      <span title={address}>{shortAddr(address, head)}</span>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Copied' : 'Copy address'}
        className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-surface-3 text-ink transition-colors hover:bg-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yolk/50"
      >
        {copied ? <CheckIcon size={11} className="text-success" /> : <CopyIcon size={11} />}
      </button>
    </span>
  );
}

/** Small "NEW" style tag inside pills. */
export function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn('rounded-pill bg-yolk px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-on-yolk', className)}>{children}</span>;
}

/** "Test launch": a token Hatch launched to test the product. Warning tint, like honest notes. */
export function TestBadge({ className, size = 'md' }: { className?: string; size?: 'md' | 'sm' }) {
  return (
    <span
      title="A test launch by the Hatch team. Not a project token; don't buy it expecting value."
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border border-warning/40 bg-warning/10 font-mono font-medium uppercase tracking-[0.08em] text-warning',
        size === 'sm' ? 'h-5 px-2 text-[10px]' : 'h-7 px-2.5 text-[11px]',
        className
      )}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3" />
      </svg>
      Test launch
    </span>
  );
}
