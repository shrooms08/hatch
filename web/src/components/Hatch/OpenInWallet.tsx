// Mobile Safari / Chrome have no wallet extensions: offer to reopen this page inside Phantom's in-app
// browser (Phantom's "browse" universal link), where the wallet is injected and signing works as on desktop.
import { useEffect, useState } from 'react';
import { useWallet } from '@jup-ag/wallet-adapter';
import { Button } from '@/components/ds';
import { phantomBrowseUrl } from '@/lib/share';
import { cn } from '@/lib/utils';


function isMobileBrowser() {
  const ua = navigator.userAgent;
  // iPadOS reports a Mac user agent: tell it apart by touch.
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function hasInjectedWallet() {
  const w = window as unknown as { phantom?: { solana?: unknown }; solana?: unknown; solflare?: unknown; backpack?: unknown };
  return !!(w.phantom?.solana || w.solana || w.solflare || w.backpack);
}

/** True on a phone browser with no wallet available in the page and none connected. */
export function useNeedsWalletApp() {
  const { publicKey, wallets } = useWallet();
  const [needs, setNeeds] = useState(false);
  useEffect(() => {
    const installed = wallets.some((w) => w.readyState === 'Installed' && !/mobile wallet adapter/i.test(w.adapter.name));
    setNeeds(isMobileBrowser() && !hasInjectedWallet() && !installed);
  }, [wallets]);
  return needs && !publicKey;
}

export function OpenInWallet({ className }: { className?: string }) {
  const needs = useNeedsWalletApp();
  if (!needs) return null;
  const href = typeof window === 'undefined' ? '#' : phantomBrowseUrl(window.location.href, window.location.origin);
  return (
    <div className={cn('flex flex-col gap-2 rounded-md border border-line bg-surface-2 p-3.5', className)}>
      <span className="text-[13px] leading-normal text-ink-2">On your phone? Open Hatch in your wallet app&apos;s browser to sign.</span>
      <Button asChild variant="secondary" size="md" block>
        <a href={href}>Open in Phantom</a>
      </Button>
    </div>
  );
}
