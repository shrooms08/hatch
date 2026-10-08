// Buttons: pill shapes. Sizes lg 64 (hero action) · md 48 · sm 36, plus the 44px header size.
// One primary per view. Ember is for hatch moments only.
import { cva, type VariantProps } from 'class-variance-authority';
import { cloneElement, forwardRef, isValidElement } from 'react';
import { cn } from '@/lib/utils';

export const dsButton = cva(
  [
    'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-pill font-sans font-semibold',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-out',
    'active:scale-[0.97] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-yolk/30',
    'disabled:pointer-events-none aria-disabled:pointer-events-none',
  ],
  {
    variants: {
      variant: {
        primary:
          'bg-yolk text-ink-on-yolk hover:bg-yolk-hi active:bg-yolk-deep disabled:bg-surface-3 disabled:text-ink-disabled disabled:shadow-none',
        secondary:
          'border border-line-strong bg-surface-2 text-ink hover:border-ink-muted hover:bg-surface-3 disabled:text-ink-disabled',
        ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink disabled:text-ink-disabled',
        ember: 'bg-ember text-ink-on-yolk hover:brightness-110 active:brightness-95 disabled:bg-surface-3 disabled:text-ink-disabled',
        outline: 'border border-line-strong text-ink hover:border-ink-muted hover:bg-surface-2 disabled:text-ink-disabled',
      },
      size: {
        lg: 'h-16 px-8 font-display text-[19px] font-bold tracking-[-0.01em]',
        md: 'h-12 px-[22px] text-[15px]',
        header: 'h-11 px-5 text-sm',
        sm: 'h-9 px-4 text-[13px]',
      },
      glow: { true: '', false: '' },
      block: { true: 'w-full', false: '' },
    },
    compoundVariants: [
      { variant: 'primary', glow: true, className: 'shadow-cta-yolk' },
      { variant: 'ember', glow: true, className: 'shadow-cta-ember' },
    ],
    defaultVariants: { variant: 'primary', size: 'md', glow: false, block: false },
  }
);

export type DsButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof dsButton> & { asChild?: boolean; loading?: boolean };

export const Button = forwardRef<HTMLButtonElement, DsButtonProps>(
  ({ className, variant, size, glow, block, asChild, loading, children, disabled, ...props }, ref) => {
    const classes = cn(dsButton({ variant, size, glow, block }), className);
    // asChild: style a single child element (e.g. a Next <Link>) as this button.
    if (asChild && isValidElement<{ className?: string }>(children)) {
      return cloneElement(children, { className: cn(classes, children.props.className) });
    }
    return (
      <button ref={ref} className={classes} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
        {loading && <Spinner />}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

/** Small ring spinner (wallet "Connecting…", busy buttons). */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-line-strong border-t-yolk', className)}
    />
  );
}

/** 44px round icon button (theme toggle, menu, close). */
export const IconButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(
  ({ className, label, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line text-ink-2',
        'transition-colors duration-150 hover:border-line-strong hover:bg-surface-2 hover:text-ink',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-yolk/30',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
);
IconButton.displayName = 'IconButton';
