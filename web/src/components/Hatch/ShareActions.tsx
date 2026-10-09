// "Share" (X intent with per-preset text + the token page link, which X shows as the token's card), "Copy link"
// and "Copy Blink" (a dial.to link to the token's buy Action; the plain token link also unfurls as a Blink
// once the site is in the Dialect Actions registry, via /actions.json).
import { useState } from 'react';
import { Button, CheckIcon, CopyIcon } from '@/components/ds';
import { blinkUrl, shareText, tokenPageUrl, xIntentUrl, type ShareInfo } from '@/lib/share';
import { cn } from '@/lib/utils';

const XLogo = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M17.75 3h3.07l-6.71 7.67L22 21h-6.18l-4.84-6.33L5.44 21H2.37l7.18-8.2L2 3h6.33l4.38 5.79L17.75 3Zm-1.08 16.2h1.7L7.4 4.7H5.57l11.1 14.5Z" />
  </svg>
);

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older mobile browsers: a hidden textarea + execCommand.
    const ta = Object.assign(document.createElement('textarea'), { value: text, readOnly: true });
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

export function ShareActions({
  mint,
  info,
  label = 'Share',
  size = 'header',
  className,
  buttonClassName,
  showBlink = false,
}: {
  mint: string;
  info: ShareInfo;
  /** Offer "Copy Blink" (the token page, for pools still on the curve). */
  showBlink?: boolean;
  label?: string;
  size?: 'header' | 'md' | 'sm';
  className?: string;
  buttonClassName?: string;
}) {
  const [copied, setCopied] = useState<'link' | 'blink' | null>(null);
  const url = tokenPageUrl(mint);
  const copy = async (what: 'link' | 'blink') => {
    if (await copyText(what === 'link' ? url : blinkUrl(mint))) {
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    }
  };
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <Button asChild variant="outline" size={size} className={cn('gap-2', buttonClassName)}>
        <a href={xIntentUrl(shareText(info), url)} target="_blank" rel="noreferrer">
          <XLogo size={size === 'sm' ? 12 : 14} />
          {label}
        </a>
      </Button>
      <Button type="button" variant="ghost" size={size} onClick={() => copy('link')} className={cn('gap-2', buttonClassName)} aria-live="polite">
        {copied === 'link' ? <CheckIcon size={13} className="text-success" /> : <CopyIcon size={13} />}
        {copied === 'link' ? 'Copied' : 'Copy link'}
      </Button>
      {showBlink && (
        <Button
          type="button"
          variant="ghost"
          size={size}
          onClick={() => copy('blink')}
          className={cn('gap-2', buttonClassName)}
          aria-live="polite"
          title="A link anyone can buy from on X, in wallets or on dial.to"
        >
          {copied === 'blink' ? <CheckIcon size={13} className="text-success" /> : <CopyIcon size={13} />}
          {copied === 'blink' ? 'Copied' : 'Copy Blink'}
        </Button>
      )}
    </div>
  );
}
