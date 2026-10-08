// Accessible modal: portal, scroll lock, Escape to close, focus moved in and restored on close.
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export function Modal({
  open,
  onClose,
  label,
  children,
  className,
  fullscreen = false,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
  className?: string;
  fullscreen?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // Keep Tab focus inside the dialog.
      if (e.key === 'Tab' && panel.current) {
        const items = [...panel.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
          (el) => el.offsetParent !== null
        );
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        const inside = panel.current.contains(document.activeElement);
        if (e.shiftKey && (document.activeElement === first || !inside)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (document.activeElement === last || !inside)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    // Focus the first focusable element (the primary action), else the panel.
    const t = setTimeout(() => {
      const first =
        panel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? panel.current?.querySelector<HTMLElement>('a[href], button:not([disabled])');
      (first ?? panel.current)?.focus();
    }, 30);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div className={cn('fixed inset-0 z-[100] flex items-center justify-center', !fullscreen && 'p-4')}>
      <div className="absolute inset-0 animate-fade-in bg-night/80 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={cn(
          'relative outline-none',
          fullscreen ? 'h-full w-full' : 'w-full max-w-lg animate-rise-in rounded-xl border border-line bg-surface-2 shadow-hatch-lg',
          className
        )}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
