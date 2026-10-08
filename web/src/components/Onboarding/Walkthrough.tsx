// First-visit walkthrough: four short cards, shown once (lib/onboarding), reopened from "How it works".
// Token pages opened from a shared link never get the modal: they show HowItWorksChip after 3 seconds.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Button, EggVessel, Modal, ShieldBadge, SmileIcon, SparkIcon, TrendIcon, XIcon } from '@/components/ds';
import { ChickenOrb } from '@/components/ds/ChickenOrb';
import { WALKTHROUGH_KEY, hasSeen, markSeen } from '@/lib/onboarding';
import { cn } from '@/lib/utils';

type Onboarding = { open: () => void; isOpen: boolean };
const OnboardingContext = createContext<Onboarding>({ open: () => {}, isOpen: false });
export const useOnboarding = () => useContext(OnboardingContext);

/** Pages that never open the walkthrough by themselves: shared token links (chip instead) and /welcome. */
const NO_AUTO_OPEN = ['/token/[tokenId]', '/welcome', '/privacy'];

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [isOpen, setOpen] = useState(false);

  useEffect(() => {
    if (!router.isReady || NO_AUTO_OPEN.includes(router.pathname) || hasSeen(WALKTHROUGH_KEY)) return;
    markSeen(WALKTHROUGH_KEY);
    setOpen(true);
  }, [router.isReady, router.pathname]);

  const open = useCallback(() => {
    markSeen(WALKTHROUGH_KEY);
    setOpen(true);
  }, []);
  const value = useMemo(() => ({ open, isOpen }), [open, isOpen]);

  return (
    <OnboardingContext.Provider value={value}>
      {children}
      <Walkthrough open={isOpen} onClose={() => setOpen(false)} />
    </OnboardingContext.Provider>
  );
}

const PRESET_TILES = [
  { icon: <TrendIcon size={16} />, iconClass: 'text-yolk', title: 'Stock-paired', text: 'The pool holds tokenized NVIDIA or Tesla. Your token is not the stock.' },
  { icon: <SmileIcon size={16} />, iconClass: 'text-ink', title: 'Meme', text: 'Classic, priced in SOL.' },
  { icon: <SparkIcon size={14} />, iconClass: 'text-info', title: 'AI agent', text: 'Gentler curve, creators earn more.' },
];

/** The token page egg, scaled down, filling up while the card is open. */
function FillingEgg() {
  const [p, setP] = useState(0.06);
  useEffect(() => {
    const t = setTimeout(() => setP(0.64), 250);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="relative h-[166px] w-[130px]" aria-hidden>
      <div className="absolute left-0 top-0 origin-top-left scale-50 [&_*]:motion-reduce:!transition-none">
        <EggVessel progress={p} compact />
      </div>
    </div>
  );
}

/** Twelve falling bars: the fee stepping down from 50% to 1% over the first minute. */
function FeeSteps() {
  const steps = Array.from({ length: 12 }, (_, i) => 50 * Math.pow(1 / 50, i / 11));
  return (
    <div className="flex flex-col items-center gap-2.5" aria-hidden>
      <ShieldBadge />
      <div className="flex h-[92px] items-end gap-[5px]">
        {steps.map((v, i) => (
          <span key={i} className="w-3 rounded-t-[4px] bg-success/70" style={{ height: Math.max(4, (v / 50) * 92) }} />
        ))}
      </div>
      <div className="flex w-full justify-between font-mono text-[11px] text-ink-muted">
        <span>50% at launch</span>
        <span>1% after 60 s</span>
      </div>
    </div>
  );
}

type Card = { title: string; body: string; visual: React.ReactNode };

const CARDS: Card[] = [
  {
    title: 'Meet Hatch',
    body: 'A little chicken lives in your browser. When you see something worth a coin, it helps you hatch one in a click.',
    visual: <ChickenOrb size={150} />,
  },
  {
    title: 'Pick what backs it',
    body: 'Every launch starts from a preset.',
    visual: (
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
        {PRESET_TILES.map((t) => (
          <div key={t.title} className="flex items-start gap-3 rounded-[14px] border border-line bg-surface-1 p-3 text-left sm:flex-col sm:gap-2">
            <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-surface-3', t.iconClass)}>{t.icon}</span>
            <span className="flex flex-col gap-0.5">
              <span className="text-[14px] font-semibold text-ink">{t.title}</span>
              <span className="text-[12.5px] leading-snug text-ink-2">{t.text}</span>
            </span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: 'Incubate, then hatch',
    body: 'Every buy pushes the price up. When it reaches its goal, it hatches into a full Meteora pool anyone can trade.',
    visual: <FillingEgg />,
  },
  {
    title: 'Sniper shield, and you earn',
    body: 'Fees start high for the first minute so bots pay, then drop to 1%. As the creator, you earn a share of every trade.',
    visual: <FeeSteps />,
  },
];

export function Walkthrough({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const last = i === CARDS.length - 1;
  const card = CARDS[i];
  useEffect(() => {
    if (open) setI(0);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') setI((n) => Math.min(CARDS.length - 1, n + 1));
    if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1));
  };

  return (
    <Modal open={open} onClose={onClose} label="How Hatch works" className="max-h-[calc(100dvh-2rem)] max-w-[560px] overflow-y-auto">
      <div className="flex flex-col gap-5 p-5 md:gap-6 md:p-7" onKeyDown={onKeyDown}>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-ink-muted" aria-live="polite">
            {i + 1} of {CARDS.length}
          </span>
          <Button variant="ghost" size="sm" onClick={onClose} className="-mr-2 gap-1.5">
            Skip
            <XIcon size={11} />
          </Button>
        </div>

        <div key={i} className="flex flex-col items-center justify-center gap-5 text-center motion-safe:animate-fade-in sm:min-h-[340px]">
          <div className="flex min-h-[170px] w-full items-center justify-center">{card.visual}</div>
          <div className="flex flex-col gap-2.5">
            <h2 className="font-display text-[26px] font-bold leading-tight tracking-[-0.03em] text-ink md:text-[30px]">{card.title}</h2>
            <p className="mx-auto max-w-[440px] text-[15px] leading-[1.55] text-ink-2">{card.body}</p>
          </div>
        </div>

        {last && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild block glow>
                <Link href="/launch" onClick={onClose}>
                  Hatch a token
                </Link>
              </Button>
              <Button asChild variant="secondary" block>
                <Link href="/extension" onClick={onClose}>
                  Get the extension
                </Link>
              </Button>
              <Button asChild variant="ghost" block>
                <Link href="/#hatches" onClick={onClose}>
                  Explore hatches
                </Link>
              </Button>
            </div>
            <p className="rounded-[14px] border border-surface-3 bg-inset px-4 py-3 text-center text-[13px] leading-normal text-ink-2">
              No wallet yet?{' '}
              <a href="https://phantom.com" target="_blank" rel="noreferrer" className="font-semibold text-ink-accent underline-offset-4 hover:underline">
                Get Phantom
              </a>
              . Pay with plain SOL. No stock tokens needed.
            </p>
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={() => setI((n) => n - 1)} disabled={i === 0} className={cn(i === 0 && 'invisible')}>
            Back
          </Button>
          <div className="flex items-center gap-1.5" role="group" aria-label="Cards">
            {CARDS.map((c, n) => (
              <button
                key={c.title}
                type="button"
                aria-label={`Card ${n + 1}: ${c.title}`}
                aria-current={n === i ? 'step' : undefined}
                onClick={() => setI(n)}
                className="flex h-6 w-6 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-yolk/30"
              >
                <span className={cn('h-2 rounded-full transition-[width,background-color] motion-reduce:transition-none', n === i ? 'w-5 bg-yolk' : 'w-2 bg-line-strong')} />
              </button>
            ))}
          </div>
          {last ? (
            <Button size="sm" variant="outline" onClick={onClose}>
              Done
            </Button>
          ) : (
            <Button size="sm" data-autofocus onClick={() => setI((n) => n + 1)}>
              Next
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Token pages: a small "New here?" chip after 3 seconds instead of the modal, for first-time visitors. */
export function HowItWorksChip({ className }: { className?: string }) {
  const { open } = useOnboarding();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (hasSeen(WALKTHROUGH_KEY)) return;
    const t = setTimeout(() => !hasSeen(WALKTHROUGH_KEY) && setShow(true), 3000);
    return () => clearTimeout(t);
  }, []);
  if (!show) return null;
  const dismiss = () => {
    markSeen(WALKTHROUGH_KEY);
    setShow(false);
  };
  return (
    <div className={cn('inline-flex h-9 items-center gap-1 self-start rounded-pill border border-yolk/35 bg-yolk/[0.10] pl-3.5 pr-1 motion-safe:animate-fade-in', className)}>
      <button
        type="button"
        onClick={() => {
          setShow(false);
          open();
        }}
        className="text-[13px] font-medium text-ink-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-yolk/30"
      >
        New here? <span className="font-semibold text-ink-accent">How Hatch works</span>
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={dismiss}
        className="flex h-7 w-7 items-center justify-center rounded-full text-ink-muted hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-yolk/30"
      >
        <XIcon size={11} />
      </button>
    </div>
  );
}
