// /welcome: opened by the extension on first install (?from=extension). Pin it, meet the chicken, open the
// panel, and exactly what the extension sends and when.
import Head from 'next/head';
import Link from 'next/link';
import Page from '@/components/ui/Page/Page';
import { Button, DotField, EGG_RADIUS, Overline, PuzzleIcon, TrendIcon } from '@/components/ds';
import { ChickenOrb } from '@/components/ds/ChickenOrb';
import { useOnboarding } from '@/components/Onboarding/Walkthrough';

const TRY_URL = 'https://finance.yahoo.com/quote/NVDA';

const NumberEgg = ({ n }: { n: number }) => (
  <span className="flex h-8 w-[26px] shrink-0 items-center justify-center bg-yolk font-display text-[13px] font-bold text-ink-on-yolk" style={{ borderRadius: EGG_RADIUS }}>
    {n}
  </span>
);

const PinIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 4h6l-1 6 3 3H7l3-3-1-6ZM12 13v7" />
  </svg>
);

const STEPS: { title: string; body: React.ReactNode; art: React.ReactNode }[] = [
  {
    title: 'Pin it',
    body: 'Click the puzzle icon in Chrome’s toolbar, then the pin next to Hatch. Now Hatch is always one click away.',
    art: (
      <div className="flex w-full flex-col gap-2 rounded-md border border-line bg-surface-2 p-3">
        <div className="flex items-center justify-end gap-2 border-b border-surface-3 pb-2">
          <span className="h-6 w-24 rounded-pill bg-surface-3" />
          <span className="flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-yolk bg-yolk/10 text-ink-accent">
            <PuzzleIcon size={15} />
          </span>
        </div>
        <div className="flex items-center justify-between rounded-[10px] bg-surface-3 px-3 py-2">
          <span className="flex items-center gap-2 text-sm font-medium text-ink">
            <span className="h-4 w-3.5 bg-yolk" style={{ borderRadius: EGG_RADIUS }} />
            Hatch
          </span>
          <span className="text-ink-accent">
            <PinIcon />
          </span>
        </div>
      </div>
    ),
  },
  {
    title: 'Meet the chicken',
    body: 'A little chicken floats on your pages. On stock pages and tweets it turns into an egg: that means it has a coin idea for you.',
    art: (
      <div className="flex items-center gap-4">
        <ChickenOrb size={76} />
        <svg width="28" height="16" viewBox="0 0 28 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="text-ink-muted" aria-hidden>
          <path d="M2 8h22M18 2l6 6-6 6" />
        </svg>
        <ChickenOrb size={76} mood="egg" />
      </div>
    ),
  },
  {
    title: 'Open the side panel',
    body: 'Click the egg (or the Hatch icon in the toolbar). The side panel drafts a name, ticker and picture. You edit it, then hatch it on this site with your own wallet.',
    art: (
      <div className="flex w-full items-stretch gap-2.5">
        <div className="flex flex-1 items-end justify-end rounded-md border border-line bg-surface-2 p-3">
          <ChickenOrb size={44} mood="egg" />
        </div>
        <div className="flex w-[46%] flex-col gap-2 rounded-md border-[1.5px] border-yolk bg-surface-2 p-3">
          <span className="h-2.5 w-3/4 rounded-full bg-line-strong" />
          <span className="h-2.5 w-1/2 rounded-full bg-surface-3" />
          <span className="mt-auto flex h-7 items-center justify-center rounded-pill bg-yolk font-display text-[11px] font-bold text-ink-on-yolk">Hatch it</span>
        </div>
      </div>
    ),
  },
];

const PRIVACY: { when: string; what: string }[] = [
  {
    when: 'Automatically, only on stock pages and tweets',
    what: 'The page title, its address (without anything after ? or #) and a short bit of text, once per page, so the chicken can offer an idea. You can turn this off in the side panel’s Settings.',
  },
  {
    when: 'On every other page, only when you click “Draft from this page”',
    what: 'Nothing leaves the page until you ask. Then the title, address, visible text and image links go to Hatch to draft your token. Opening the panel on a stock page or tweet drafts it right away.',
  },
  {
    when: 'Never',
    what: 'Your wallet keys never leave your wallet. The extension holds no keys, wallets or API keys: you sign on this site, in your own wallet.',
  },
];

export default function WelcomePage() {
  const { open: openHowItWorks } = useOnboarding();
  return (
    <Page bleed>
      <Head>
        <title>Hatch is installed - Hatch</title>
      </Head>
      <section className="relative">
        <DotField />
        <div className="relative mx-auto flex max-w-[1440px] flex-col-reverse items-start gap-8 px-4 pb-12 pt-10 md:px-10 lg:flex-row lg:items-center lg:px-20 lg:pb-16 lg:pt-[80px]">
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            <Overline className="text-[12px] text-ink-accent">Welcome</Overline>
            <h1 className="font-display text-[40px] font-bold leading-[0.95] tracking-[-0.04em] text-ink sm:text-[56px] xl:text-[80px]">Hatch is installed.</h1>
            <p className="max-w-[560px] text-pretty text-[15px] leading-[1.6] text-ink-2 md:text-[18px]">
              Three quick things and you are ready. Then try it on a stock page: the chicken will turn into an egg.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild glow className="h-[56px] px-7 text-base">
                <a href={TRY_URL} target="_blank" rel="noreferrer">
                  <TrendIcon size={16} />
                  Try it on NVIDIA
                </a>
              </Button>
              <Button variant="secondary" className="h-[56px] px-7 text-base" onClick={openHowItWorks}>
                How Hatch works
              </Button>
            </div>
          </div>
          <div className="relative flex shrink-0 items-center justify-center lg:h-[300px] lg:w-[340px]" aria-hidden>
            <div className="absolute hidden h-[300px] w-[300px] rounded-full border border-dashed border-line-strong lg:block" />
            <ChickenOrb size={160} className="hidden motion-safe:animate-pop-in lg:flex" />
            <ChickenOrb size={84} className="lg:hidden" />
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1440px] px-4 pb-10 md:px-10 lg:px-20" aria-labelledby="steps-h">
        <h2 id="steps-h" className="mb-6 font-display text-[26px] font-bold tracking-[-0.025em] text-ink md:text-4xl">
          Get started
        </h2>
        <ol className="grid gap-3 md:grid-cols-3 md:gap-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex flex-col overflow-hidden rounded-[24px] border border-surface-3 bg-surface-1 max-md:rounded-[16px]">
              <div className="flex h-[150px] items-center justify-center border-b border-surface-3 bg-inset px-[22px] md:h-[190px]">{s.art}</div>
              <div className="flex flex-col gap-2 p-4 md:p-[22px]">
                <div className="flex items-center gap-2.5">
                  <NumberEgg n={i + 1} />
                  <span className="text-[15px] font-semibold text-ink md:text-[17px]">{s.title}</span>
                </div>
                <span className="text-[13px] leading-normal text-ink-2 md:text-sm">{s.body}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto w-full max-w-[1440px] px-4 pb-20 md:px-10 lg:px-20 lg:pb-[104px]" aria-labelledby="privacy-h">
        <div className="flex flex-col gap-5 rounded-[24px] border border-surface-3 bg-inset p-5 md:p-8">
          <div className="flex flex-col gap-1.5">
            <h2 id="privacy-h" className="font-display text-[22px] font-bold tracking-[-0.02em] text-ink md:text-[28px]">
              What Hatch sends, and when
            </h2>
            <p className="text-sm text-ink-2">Everything the extension sends to Hatch, in plain words.</p>
          </div>
          <dl className="grid gap-3 md:grid-cols-3 md:gap-4">
            {PRIVACY.map((p) => (
              <div key={p.when} className="flex flex-col gap-2 rounded-[16px] border border-surface-3 bg-surface-1 p-4">
                <dt className="text-[15px] font-semibold text-ink">{p.when}</dt>
                <dd className="text-[13px] leading-normal text-ink-2 md:text-sm">{p.what}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-ink-2">Ready? Open a stock page and watch the chicken.</span>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button asChild>
                <a href={TRY_URL} target="_blank" rel="noreferrer">
                  Try it on NVIDIA
                </a>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/launch">Hatch a token</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </Page>
  );
}
