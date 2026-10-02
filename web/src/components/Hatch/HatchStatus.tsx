import { cn } from '@/lib/utils';
import { STATUS_LABEL, type HatchStatus } from '@/lib/dbc/pool';

const STATUS_CLASS: Record<HatchStatus, string> = {
  INCUBATING: 'bg-neutral-900 text-neutral-300',
  ALMOST_HATCHED: 'bg-primary/15 text-primary',
  HATCHED: 'bg-emerald/15 text-emerald',
};

export function HatchStatusBadge({ status, className }: { status: HatchStatus; className?: string }) {
  return (
    <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', STATUS_CLASS[status], className)}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function CurveProgress({ progress, className }: { progress: number; className?: string }) {
  const pct = Math.round(progress * 10_000) / 100;
  return (
    <div className={cn('w-full', className)}>
      <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-850">
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 text-xs text-neutral-400">{pct.toFixed(2)}% to hatch</div>
    </div>
  );
}
