// Toggle switch, segmented tabs (Buy/Sell, list filters), and chip groups (slippage, quick amounts).
import { cn } from '@/lib/utils';

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[26px] w-11 shrink-0 rounded-pill border transition-colors duration-200 ease-out',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-yolk/30 disabled:opacity-50',
        checked ? 'border-yolk bg-yolk' : 'border-line-strong bg-surface-3',
        className
      )}
    >
      <span
        className={cn(
          'absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full transition-[left,background-color] duration-200 ease-out',
          checked ? 'left-[20px] bg-night' : 'left-[2px] bg-ink-muted'
        )}
      />
    </button>
  );
}

export type SegmentOption<T extends string> = { value: T; label: React.ReactNode };

/**
 * Segmented control. The active thumb slides between equal-width segments (`equal`), or each
 * segment fills on its own (`auto`, for filters with different label widths).
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  equal = true,
  size = 'md',
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: SegmentOption<T>[];
  equal?: boolean;
  size?: 'md' | 'lg' | 'sm';
  label: string;
  className?: string;
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const h = size === 'lg' ? 'h-[42px] text-[15px]' : size === 'sm' ? 'h-8 text-[13px]' : 'h-[38px] text-sm';
  return (
    <div role="tablist" aria-label={label} className={cn('relative flex rounded-pill border border-line bg-inset p-1', className)}>
      {equal && (
        <span
          aria-hidden
          className="absolute bottom-1 top-1 rounded-pill bg-yolk transition-transform duration-200 ease-out"
          style={{ left: 4, width: `calc((100% - 8px) / ${options.length})`, transform: `translateX(${idx * 100}%)` }}
        />
      )}
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative z-[1] flex items-center justify-center whitespace-nowrap rounded-pill px-[18px] font-semibold transition-colors duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yolk/50',
              h,
              equal && 'flex-1',
              active ? 'text-ink-on-yolk' : 'text-ink-2 hover:text-ink',
              !equal && active && 'bg-yolk'
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Chip group: 34px mono chips, selected = yolk outline + tint, optional dashed "Custom". */
export function ChipGroup<T extends string | number>({
  value,
  onChange,
  options,
  label,
  className,
  chipClassName,
}: {
  value: T | null;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  label: string;
  className?: string;
  chipClassName?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn('flex flex-wrap gap-2', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex h-[34px] items-center justify-center rounded-pill border px-3.5 font-mono text-[13px] font-medium transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yolk/50',
              active ? 'border-yolk bg-yolk/[0.12] text-ink-accent' : 'border-line text-ink-2 hover:border-line-strong hover:text-ink',
              chipClassName
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
