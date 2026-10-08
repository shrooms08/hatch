// Toasts (design/v1 "TOASTS"): raised card, round status icon, title, body, one link action, close.
// Rendered through sonner's custom toasts so stacking, swipe and timing stay sonner's.
import { toast as sonner } from 'sonner';
import { cn } from '@/lib/utils';
import { ArrowUpRight, CheckIcon, XIcon } from './icons';

type Action = { label: string; href?: string; onClick?: () => void };
type ToastInput = { title: string; body?: React.ReactNode; action?: Action; duration?: number };

function HatchToast({ id, tone, title, body, action }: ToastInput & { id: string | number; tone: 'success' | 'error' | 'info' }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto flex w-[min(380px,calc(100vw-32px))] items-start gap-3.5 rounded-[18px] border bg-surface-2 p-4 font-sans text-ink shadow-hatch-lg',
        tone === 'error' ? 'border-danger/40' : 'border-line'
      )}
    >
      <span
        className={cn(
          'flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full',
          tone === 'success' && 'bg-success/[0.14] text-success',
          tone === 'error' && 'bg-danger/[0.14] text-danger',
          tone === 'info' && 'bg-yolk/[0.14] text-yolk'
        )}
      >
        {tone === 'error' ? <XIcon size={14} /> : tone === 'success' ? <CheckIcon size={16} /> : <span className="h-2 w-2 rounded-full bg-yolk" />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[15px] font-semibold leading-snug">{title}</span>
        {body && <span className="break-words text-[13px] leading-snug text-ink-2">{body}</span>}
        {action &&
          (action.href ? (
            <a
              href={action.href}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex w-fit items-center gap-1 text-[13px] font-medium text-ink-accent hover:underline"
            >
              {action.label}
              <ArrowUpRight size={11} />
            </a>
          ) : (
            <button
              type="button"
              onClick={() => {
                action.onClick?.();
                sonner.dismiss(id);
              }}
              className="mt-1 w-fit text-left text-[13px] font-medium text-ink-accent hover:underline"
            >
              {action.label}
            </button>
          ))}
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => sonner.dismiss(id)}
        className="-mr-1 -mt-1 rounded-full p-1 text-lg leading-none text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yolk/50"
      >
        ×
      </button>
    </div>
  );
}

const show = (tone: 'success' | 'error' | 'info') => (input: ToastInput | string) => {
  const t = typeof input === 'string' ? { title: input } : input;
  return sonner.custom((id) => <HatchToast id={id} tone={tone} {...t} />, { duration: t.duration ?? (tone === 'error' ? 9000 : 6000) });
};

export const notify = { success: show('success'), error: show('error'), info: show('info') };
