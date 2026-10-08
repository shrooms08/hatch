// Numbers as data: Geist Mono, tabular, tiny values with subscript zeros (0.0₈1741 -> 0.0<sub>8</sub>1741),
// always followed by the unit in muted text. Formatting comes from the one shared helper.
import { formatAmount, type Numberish } from '@/lib/format/amount';
import { cn } from '@/lib/utils';

const SUB = '₀₁₂₃₄₅₆₇₈₉';

/** Splits formatAmount output so the zero count renders as a real <sub>, not a unicode glyph. */
export function SubscriptNumber({ text }: { text: string }) {
  const m = text.match(/^(-?0\.0)([₀-₉]+)(\d+)$/);
  if (!m) return <>{text}</>;
  const zeros = [...m[2]].map((c) => SUB.indexOf(c)).join('');
  return (
    <>
      {m[1]}
      <sub className="relative -bottom-[0.1em] align-baseline text-[0.62em] leading-none">{zeros}</sub>
      {m[3]}
    </>
  );
}

export function Amount({
  value,
  unit,
  className,
  unitClassName,
  placeholder = '-',
}: {
  value: Numberish | null | undefined;
  unit?: string;
  className?: string;
  unitClassName?: string;
  placeholder?: string;
}) {
  const text = value === null || value === undefined ? placeholder : formatAmount(value);
  return (
    <span className={cn('font-mono tabular-nums', className)}>
      <SubscriptNumber text={text} />
      {unit ? <span className={cn('ml-[0.4em] text-ink-muted', unitClassName)}>{unit}</span> : null}
    </span>
  );
}

/** "Price ........ 0.0₈1741 NVDAx": label, dotted leader, mono value. */
export function DefRow({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-baseline gap-2.5 text-sm', className)}>
      <span className="shrink-0 text-ink-2">{label}</span>
      <span aria-hidden className="min-w-4 flex-1 -translate-y-1 border-b border-dotted border-line-strong" />
      <span className="min-w-0 truncate text-right font-mono text-sm font-medium text-ink">{children}</span>
    </div>
  );
}
