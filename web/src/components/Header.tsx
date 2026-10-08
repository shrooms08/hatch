import { useUnifiedWalletContext, useWallet } from '@jup-ag/wallet-adapter';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTheme } from 'next-themes';
import { useEffect, useRef, useState } from 'react';
import { Amount, Button, EggGlyph, HatchLogo, IconButton, MenuIcon, MoonIcon, Spinner, SunIcon, XIcon, notify } from '@/components/ds';
import { NETWORK } from '@/lib/config/network';
import { WSOL } from '@/lib/jupiter';
import { useTokenBalance } from '@/hooks/useHatch';
import { cn } from '@/lib/utils';

export const NAV = [
  { href: '/', label: 'Hatches' },
  { href: '/my-hatches', label: 'My Hatches' },
  { href: '/extension', label: 'Get the extension' },
] as const;

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

function NetworkPill() {
  const main = NETWORK === 'mainnet-beta';
  return (
    <span className="hidden items-center gap-1.5 rounded-pill border border-line px-[9px] py-[5px] font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted sm:inline-flex">
      <span className={cn('h-1.5 w-1.5 rounded-full', main ? 'bg-success' : 'bg-warning')} />
      {main ? 'Mainnet' : 'Devnet'}
    </span>
  );
}

function Avatar({ size = 22 }: { size?: number }) {
  return <span aria-hidden className="shrink-0 rounded-full bg-[conic-gradient(#F2A93B,#E8572A,#F6EEDC,#F2A93B)]" style={{ width: size, height: size }} />;
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = !mounted || resolvedTheme !== 'light';
  return (
    <IconButton label={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setTheme(dark ? 'light' : 'dark')}>
      {dark ? <MoonIcon size={16} /> : <SunIcon size={16} />}
    </IconButton>
  );
}

/** Wallet states: Connect wallet · Connecting… · connected (SOL balance + address, with a menu). */
function WalletButton({ compact = false }: { compact?: boolean }) {
  const { setShowModal } = useUnifiedWalletContext();
  const { publicKey, connecting, disconnect } = useWallet();
  const address = publicKey?.toBase58();
  const sol = useTokenBalance(publicKey, WSOL.toBase58());
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (connecting && !address)
    return (
      <span className="inline-flex h-11 items-center gap-2.5 rounded-pill border border-line bg-surface-2 px-[18px] text-sm font-medium text-ink-2">
        <Spinner />
        {compact ? '' : 'Connecting…'}
      </span>
    );

  if (!address)
    return (
      <Button size="header" onClick={() => setShowModal(true)} className={compact ? 'h-10 px-4 text-[13px]' : ''}>
        {compact ? 'Connect' : 'Connect wallet'}
      </Button>
    );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex items-center gap-2.5 rounded-pill border border-line bg-surface-2 transition-colors hover:border-line-strong',
          'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-yolk/30',
          compact ? 'h-10 pl-1.5 pr-3' : 'h-11 pl-3.5 pr-1.5'
        )}
      >
        {!compact && (
          <span className="font-mono text-[13px] font-medium text-ink-2">
            {sol.data ? <Amount value={sol.data.toDecimalPlaces(2)} unit="SOL" unitClassName="text-ink-2" /> : '… SOL'}
          </span>
        )}
        <span className={cn('flex items-center gap-2 rounded-pill', compact ? '' : 'h-[34px] bg-surface-3 pl-1.5 pr-3')}>
          <Avatar size={compact ? 26 : 22} />
          <span className="font-mono text-[13px] font-medium text-ink">{short(address)}</span>
        </span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-50 flex w-[260px] animate-rise-in flex-col rounded-[16px] border border-line bg-surface-2 p-1.5 shadow-hatch-lg">
          <button
            role="menuitem"
            type="button"
            className="flex items-center justify-between rounded-sm px-3 py-2.5 text-left text-sm text-ink hover:bg-surface-3"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(address);
                notify.success({ title: 'Address copied', body: short(address) });
              } catch {
                notify.error('Could not copy the address');
              }
              setOpen(false);
            }}
          >
            Copy address <span className="font-mono text-xs text-ink-muted">{short(address)}</span>
          </button>
          <Link role="menuitem" href="/my-hatches" onClick={() => setOpen(false)} className="rounded-sm px-3 py-2.5 text-sm text-ink hover:bg-surface-3">
            My Hatches
          </Link>
          <button
            role="menuitem"
            type="button"
            className="rounded-sm px-3 py-2.5 text-left text-sm text-danger hover:bg-surface-3"
            onClick={() => {
              setOpen(false);
              void disconnect();
            }}
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

function MobileMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pathname } = useRouter();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="absolute inset-0 animate-fade-in bg-night/80 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <nav className="absolute inset-x-3 top-3 animate-rise-in rounded-xl border border-line bg-surface-2 p-3 shadow-hatch-lg">
        <div className="mb-2 flex items-center justify-between px-2">
          <HatchLogo size={26} />
          <IconButton label="Close menu" onClick={onClose}>
            <XIcon size={14} />
          </IconButton>
        </div>
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            onClick={onClose}
            className={cn('block rounded-md px-3 py-3 text-[17px] font-medium', pathname === n.href ? 'bg-surface-3 text-ink' : 'text-ink-2 hover:bg-surface-3')}
          >
            {n.label}
          </Link>
        ))}
        <Button asChild block className="mt-2">
          <Link href="/launch" onClick={onClose}>
            <EggGlyph size={15} />
            Hatch a token
          </Link>
        </Button>
        <div className="mt-3 flex items-center justify-between px-2 pb-1">
          <NetworkPillInline />
          <ThemeToggle />
        </div>
      </nav>
    </div>
  );
}

function NetworkPillInline() {
  const main = NETWORK === 'mainnet-beta';
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-muted">
      <span className={cn('h-1.5 w-1.5 rounded-full', main ? 'bg-success' : 'bg-warning')} />
      Solana {main ? 'Mainnet' : 'Devnet'}
    </span>
  );
}

export const Header = () => {
  const { pathname } = useRouter();
  const [menu, setMenu] = useState(false);
  const active = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <header className="sticky top-0 z-40 w-full border-b border-surface-3 bg-hatch-bg/90 backdrop-blur-md">
      {/* Desktop: 76px, 40px gutters */}
      <div className="mx-auto hidden h-[76px] max-w-[1440px] items-center justify-between gap-4 px-6 md:flex lg:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" aria-label="Hatch home" className="rounded-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-yolk/30">
            <HatchLogo size={30} />
          </Link>
          <NetworkPill />
        </div>
        <nav className="flex items-center gap-1" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active(n.href) ? 'page' : undefined}
              className={cn(
                'whitespace-nowrap rounded-pill px-4 py-2.5 text-[15px] font-medium transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-yolk/30',
                active(n.href) ? 'bg-surface-2 text-ink' : 'text-ink-nav hover:text-ink'
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2.5">
          <Button asChild variant="outline" size="header" className="hidden lg:inline-flex">
            <Link href="/launch">
              <EggGlyph size={15} className="text-yolk" />
              Hatch a token
            </Link>
          </Button>
          <WalletButton />
          <ThemeToggle />
        </div>
      </div>

      {/* Mobile: 60px */}
      <div className="flex h-[60px] items-center justify-between px-4 md:hidden">
        <Link href="/" aria-label="Hatch home">
          <HatchLogo size={26} />
        </Link>
        <div className="flex items-center gap-2">
          <WalletButton compact />
          <IconButton label="Open menu" onClick={() => setMenu(true)} className="text-ink">
            <MenuIcon size={18} />
          </IconButton>
        </div>
      </div>
      <MobileMenu open={menu} onClose={() => setMenu(false)} />
    </header>
  );
};

export default Header;
