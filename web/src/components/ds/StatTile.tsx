import { cn } from '@/lib/utils';
import { Overline, Skeleton } from './Card';

/** Stat: mono overline + big Unbounded number. Used in the Home live-stats strip. */
export function StatTile({ label, value, loading, className, size = 'lg' }: { label: string; value: React.ReactNode; loading?: boolean; className?: string; size?: 'lg' | 'sm' }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', size === 'lg' ? 'px-8 py-7' : 'px-3.5 py-3', className)}>
      <Overline className={size === 'sm' ? 'text-[9px]' : ''}>{label}</Overline>
      {loading ? (
        <Skeleton className={size === 'lg' ? 'h-11 w-32 rounded-md' : 'h-6 w-16 rounded-xs'} />
      ) : (
        <span
          className={cn(
            'truncate font-display font-bold leading-none tracking-[-0.03em] text-ink',
            size === 'lg' ? 'text-[44px]' : 'text-[21px]'
          )}
        >
          {value}
        </span>
      )}
    </div>
  );
}
