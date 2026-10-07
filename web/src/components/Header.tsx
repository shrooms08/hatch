import { useUnifiedWalletContext, useWallet } from '@jup-ag/wallet-adapter';
import Link from 'next/link';
import { Button } from './ui/button';
import { CreatePoolButton } from './CreatePoolButton';
import { ThemeToggle } from './ThemeToggle';
import { useMemo } from 'react';
import { cn, shortenAddress } from '@/lib/utils';
import { buttonVariants } from './ui/button';
import { NETWORK } from '@/lib/config/network';

export const Header = () => {
  const { setShowModal } = useUnifiedWalletContext();

  const { disconnect, publicKey } = useWallet();
  const address = useMemo(() => publicKey?.toBase58(), [publicKey]);

  const handleConnectWallet = () => {
    setShowModal(true);
  };

  return (
    <header className="w-full border-b border-neutral-850 bg-background/80 backdrop-blur-md">
      <div className="flex h-14 w-full items-center justify-between gap-2 px-3 md:h-16 md:px-4">
        {/* Logo Section */}
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <span className="iconify h-5 w-5 ph--egg-bold" />
          </span>
          <span className="truncate whitespace-nowrap text-base font-bold tracking-tight md:text-xl">
            Hatch
          </span>
          {NETWORK === 'devnet' ? (
            <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-xs text-neutral-400">devnet</span>
          ) : (
            <span className="hidden text-[10px] uppercase tracking-wider text-neutral-500 sm:inline">mainnet</span>
          )}
        </Link>

        {/* Navigation and Actions */}
        <div className="flex items-center gap-1.5 md:gap-3">
          <Link href="/extension" className={cn(buttonVariants({ variant: 'ghost' }), 'hidden md:inline-flex')}>
            Get the extension
          </Link>
          <Link href="/my-hatches" className={cn(buttonVariants({ variant: 'ghost' }), 'hidden sm:inline-flex')}>
            My Hatches
          </Link>
          <CreatePoolButton />
          {address ? (
            <Button variant="secondary" onClick={() => disconnect()}>
              <span className="iconify h-4 w-4 ph--wallet-bold" />
              {shortenAddress(address)}
            </Button>
          ) : (
            <Button
              onClick={() => {
                handleConnectWallet();
              }}
            >
              <span className="hidden md:block">Connect Wallet</span>
              <span className="block md:hidden">Connect</span>
            </Button>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};

export default Header;
