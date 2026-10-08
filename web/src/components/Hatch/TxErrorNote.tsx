// A failed transaction, in the design system's error style: one plain sentence, with the raw error behind
// "Show details" (scrollable mono box + "Copy details").
import { useState } from 'react';
import { CheckIcon, CopyIcon, WarnIcon, XIcon } from '@/components/ds';
import type { FriendlyError } from '@/lib/txErrors';
import { cn } from '@/lib/utils';

export function TxErrorNote({ error, onDismiss, className }: { error: FriendlyError | null; onDismiss?: () => void; className?: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!error) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(error.details);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked: the text is selectable */
    }
  };
  return (
    <div role="alert" className={cn('flex flex-col gap-2 rounded-[14px] border border-danger/40 bg-danger/[0.06] px-3.5 py-3', className)}>
      <div className="flex items-start gap-2.5">
        <WarnIcon size={16} className="mt-0.5 shrink-0 text-danger" />
        <span className="min-w-0 flex-1 text-[13px] leading-normal text-ink">{error.message}</span>
        {onDismiss && (
          <button type="button" aria-label="Dismiss" onClick={onDismiss} className="-mr-1 -mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-ink-muted hover:text-ink">
            <XIcon size={10} />
          </button>
        )}
      </div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="self-start pl-[26px] text-xs font-medium text-ink-muted underline-offset-4 hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yolk/40"
      >
        {open ? 'Hide details' : 'Show details'}
      </button>
      {open && (
        <div className="flex flex-col gap-2">
          <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-md border border-surface-3 bg-inset p-3 font-mono text-[11px] leading-relaxed text-ink-2">{error.details}</pre>
          <button type="button" onClick={copy} className="inline-flex items-center gap-1.5 self-start rounded-pill px-2 py-1 text-xs font-medium text-ink-2 hover:bg-surface-3 hover:text-ink">
            {copied ? <CheckIcon size={11} className="text-success" /> : <CopyIcon size={11} />}
            {copied ? 'Copied' : 'Copy details'}
          </button>
        </div>
      )}
    </div>
  );
}

/** Not enough SOL for what the button would do (balance preflight). */
export function SolShortNote({ need, have, className }: { need: string; have: string; className?: string }) {
  return (
    <div role="status" className={cn('flex gap-2.5 rounded-[14px] border border-warning/35 bg-warning/[0.08] px-3.5 py-3', className)}>
      <WarnIcon size={16} className="mt-0.5 shrink-0 text-warning" />
      <span className="text-[13px] leading-normal text-ink">
        You need about {need} SOL. You have {have}. <span className="text-ink-2">Add SOL to your wallet (in Phantom: Buy or Receive), then try again.</span>
      </span>
    </div>
  );
}
