import { forwardRef, useId } from 'react';
import { cn } from '@/lib/utils';

/** Label + control + hint/error. Labels 13/500 secondary. */
export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  aside,
  className,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  htmlFor?: string;
  aside?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-2">
          {label}
          {required && <span className="text-ink-muted"> *</span>}
        </label>
        {aside && <span className="text-xs text-ink-muted">{aside}</span>}
      </div>
      {children}
      {error ? (
        <span className="text-xs text-danger" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="text-xs text-ink-muted">{hint}</span>
      ) : null}
    </div>
  );
}

/** Shared input shell: 52px, radius md, inset surface; yolk ring on focus, error border. */
export const inputShell = (invalid?: boolean) =>
  cn(
    'flex w-full items-center rounded-md border bg-inset text-[15px] text-ink transition-[border-color,box-shadow] duration-150',
    'focus-within:border-yolk focus-within:shadow-focus',
    invalid ? 'border-danger' : 'border-line hover:border-line-strong'
  );

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  mono?: boolean;
  shellClassName?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(({ invalid, prefix, suffix, mono, className, shellClassName, ...props }, ref) => {
  const id = useId();
  return (
    <div className={cn(inputShell(invalid), 'h-[52px] gap-1 pl-4 pr-2', shellClassName)}>
      {prefix && <span className="shrink-0 font-mono text-ink-muted">{prefix}</span>}
      <input
        id={props.id ?? id}
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          'h-full min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-muted',
          mono && 'font-mono font-medium',
          className
        )}
        {...props}
      />
      {suffix && <span className="shrink-0 pr-2">{suffix}</span>}
    </div>
  );
});
Input.displayName = 'Input';

export const TextArea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  ({ invalid, className, ...props }, ref) => (
    <div className={cn(inputShell(invalid), 'items-stretch')}>
      <textarea
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn('min-h-[96px] w-full resize-y bg-transparent px-4 py-3.5 leading-normal outline-none placeholder:text-ink-muted', className)}
        {...props}
      />
    </div>
  )
);
TextArea.displayName = 'TextArea';

/** Round token badge used at the right edge of amount inputs ("SOL", "HGTEST"). */
export function TokenBadge({ symbol, image, className }: { symbol: string; image?: string | null; className?: string }) {
  return (
    <span className={cn('inline-flex h-9 shrink-0 items-center gap-1.5 rounded-pill bg-surface-2 px-2.5 text-[13px] font-semibold text-ink', className)}>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-5 w-5 rounded-full object-cover" />
      ) : symbol === 'SOL' ? (
        <span className="h-4 w-4 rounded-full bg-[linear-gradient(135deg,#8DB4FF,#7BD389)]" />
      ) : (
        <span className="h-4 w-4 rounded-full bg-yolk" />
      )}
      {symbol}
    </span>
  );
}
