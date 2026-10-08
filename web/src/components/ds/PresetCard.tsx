import type { PresetId } from '@/lib/presets';
import { cn } from '@/lib/utils';
import { SNIPER_SHIELD_LINE } from '@/lib/dbc/feeSchedule';
import { SmileIcon, SparkIcon, TrendIcon } from './icons';
import { ShieldBadge } from './Pill';

const ICON: Record<PresetId, React.ReactNode> = {
  STOCK: <TrendIcon size={18} />,
  MEME: <SmileIcon size={18} />,
  AI_AGENT: <SparkIcon size={16} />,
};

/** Selectable preset card (Hatch a token). Selected: yolk border + glow, yolk icon tile. */
export function PresetCard({
  preset,
  title,
  quote,
  description,
  selected,
  disabled,
  disabledNote,
  shield,
  onSelect,
}: {
  preset: PresetId;
  title: string;
  quote: string;
  description: string;
  selected: boolean;
  disabled?: boolean;
  disabledNote?: string;
  /** The config has a Sniper shield (decaying launch fee). */
  shield?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'group flex w-full items-center gap-3.5 rounded-[16px] border p-4 text-left transition-[border-color,background-color,box-shadow] duration-150 ease-out',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-yolk/30',
        selected ? 'border-yolk bg-yolk/[0.06] shadow-glow-yolk' : 'border-line bg-surface-1 hover:border-line-strong hover:bg-surface-2',
        disabled && 'cursor-not-allowed opacity-50 hover:border-line hover:bg-surface-1'
      )}
    >
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-sm transition-colors',
          selected ? 'bg-yolk text-ink-on-yolk' : 'bg-surface-3 text-ink',
          !selected && preset === 'AI_AGENT' && 'text-info'
        )}
      >
        {ICON[preset]}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-1.5 text-[15px] font-semibold text-ink">
          {title}
          <span className={cn('font-mono text-[11px] font-medium', preset === 'STOCK' ? 'text-ink-accent' : 'text-ink-muted')}>{quote}</span>
          {shield && !disabled && <ShieldBadge size="sm" className="ml-auto self-center" />}
        </span>
        <span className="text-[13px] text-ink-2">{disabled && disabledNote ? disabledNote : description}</span>
        {shield && !disabled && <span className="text-xs text-ink-muted">{SNIPER_SHIELD_LINE}</span>}
      </span>
    </button>
  );
}
