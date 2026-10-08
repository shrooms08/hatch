// First-time tips: each shows once (lib/onboarding) and can be dismissed. Tips wait while the walkthrough
// is open, so a first visit doesn't spend them behind the modal.
import { useEffect, useState } from 'react';
import { XIcon } from '@/components/ds';
import { hasSeen, markSeen, tipKey } from '@/lib/onboarding';
import { cn } from '@/lib/utils';
import { useOnboarding } from './Walkthrough';

export function Tip({
  id,
  title,
  children,
  className,
  media,
}: {
  id: string;
  title?: string;
  children: React.ReactNode;
  className?: string;
  /** Only this copy shows when the media query matches (for layouts that render a block twice). */
  media?: string;
}) {
  const { isOpen } = useOnboarding();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (isOpen || show || hasSeen(tipKey(id))) return;
    if (media && !window.matchMedia(media).matches) return;
    markSeen(tipKey(id)); // shown once: it stays up for this visit until dismissed
    setShow(true);
  }, [id, isOpen, show, media]);
  if (!show || isOpen) return null;
  return (
    <div role="note" className={cn('flex items-start gap-3 rounded-[14px] border border-yolk/30 bg-yolk/[0.07] py-3 pl-4 pr-2 motion-safe:animate-fade-in', className)}>
      <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-yolk" aria-hidden />
      <span className="min-w-0 flex-1 text-[13px] leading-normal text-ink-2">
        {title && <span className="font-semibold text-ink">{title} </span>}
        {children}
      </span>
      <button
        type="button"
        aria-label="Dismiss tip"
        onClick={() => setShow(false)}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-yolk/30"
      >
        <XIcon size={11} />
      </button>
    </div>
  );
}
