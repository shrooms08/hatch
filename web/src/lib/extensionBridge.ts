// Tells the Hatch browser extension (if installed) about public events on this page, so it can
// track the user's hatches. Only public addresses are sent, and only to this page's own origin;
// the extension's bridge content script checks event.origin before forwarding.
import { useEffect } from 'react';
import { useWallet } from '@jup-ag/wallet-adapter';

export type HatchEvent = { type: 'HATCH_EVENT'; event: 'launched' | 'wallet'; wallet: string; mint?: string };

export function emitHatchEvent(event: HatchEvent['event'], wallet: string, mint?: string) {
  if (typeof window === 'undefined') return;
  const message: HatchEvent = { type: 'HATCH_EVENT', event, wallet, ...(mint ? { mint } : {}) };
  window.postMessage(message, window.location.origin);
}

/** Emits a "wallet" event whenever a wallet connects (or changes). Mount once, inside the wallet provider. */
export function useWalletHatchEvents() {
  const { publicKey } = useWallet();
  const address = publicKey?.toBase58();
  useEffect(() => {
    if (address) emitHatchEvent('wallet', address);
  }, [address]);
}
