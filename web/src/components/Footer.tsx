import Link from 'next/link';
import { HatchLogo } from '@/components/ds';
import { NETWORK } from '@/lib/config/network';

const PRODUCT = [
  { href: '/', label: 'Hatches' },
  { href: '/launch', label: 'Hatch a token' },
  { href: '/my-hatches', label: 'My Hatches' },
  { href: '/extension', label: 'Get the extension' },
];
const MORE = [
  { href: '/launch#how-it-works', label: 'How hatching works' },
  { href: '/privacy', label: 'Privacy' },
  { href: 'https://docs.meteora.ag/overview/products/dbc/what-is-dbc', label: 'Meteora DBC', external: true },
  { href: 'https://x.com', label: 'X / Twitter', external: true },
];

export function Footer() {
  const linkCls = 'text-sm text-ink transition-colors hover:text-ink-accent';
  return (
    <footer className="border-t border-surface-3 bg-hatch-bg">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-7 px-5 pb-7 pt-9 md:px-10 md:pb-8 md:pt-14">
        <div className="flex flex-wrap justify-between gap-7">
          <div className="flex max-w-[360px] flex-col gap-3">
            <HatchLogo size={26} />
            <p className="text-sm leading-normal text-ink-2">
              Launch anything you see. Tokens incubate on Meteora&apos;s Dynamic Bonding Curve and hatch into a full pool.
            </p>
          </div>
          <div className="flex flex-wrap gap-12">
            <nav className="flex flex-col gap-2.5" aria-label="Product">
              <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">Product</span>
              {PRODUCT.map((l) => (
                <Link key={l.href} href={l.href} className={linkCls}>
                  {l.label}
                </Link>
              ))}
            </nav>
            <nav className="flex flex-col gap-2.5" aria-label="More">
              <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted">More</span>
              {MORE.map((l) =>
                l.external ? (
                  <a key={l.href} href={l.href} target="_blank" rel="noreferrer" className={linkCls}>
                    {l.label} <span className="text-ink-muted">↗</span>
                  </a>
                ) : (
                  <Link key={l.href} href={l.href} className={linkCls}>
                    {l.label}
                  </Link>
                )
              )}
            </nav>
          </div>
        </div>
        <div className="flex flex-wrap justify-between gap-3 border-t border-surface-3 pt-5 font-mono text-xs text-ink-muted">
          <span>Tokens are experimental and can lose all value. Not investment advice.</span>
          <span>
            Solana {NETWORK === 'mainnet-beta' ? 'Mainnet' : 'Devnet'} · © {new Date().getFullYear()} Hatch
          </span>
        </div>
      </div>
    </footer>
  );
}
