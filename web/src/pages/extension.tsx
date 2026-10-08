import Head from 'next/head';
import type { GetStaticProps } from 'next';
import Page from '@/components/ui/Page/Page';
import { Button, DotField, DownloadIcon, EGG_RADIUS, Overline } from '@/components/ds';
import { ChickenOrb } from '@/components/ds/ChickenOrb';

const EXTENSION_VERSION = '0.2.0';
const FILE = `hatch-extension-v${EXTENSION_VERSION}.zip`;

type Props = { downloadUrl: string; size: string | null };

// The zip lives on the public R2 bucket (the GitHub repo is private for now). Its size is read at build.
export const getStaticProps: GetStaticProps<Props> = async () => {
  const r2 = (process.env.R2_PUBLIC_URL ?? '').replace(/\/+$/, '');
  const downloadUrl = r2 ? `${r2}/releases/${FILE}` : `https://github.com/shrooms08/hatch/releases/tag/v${EXTENSION_VERSION}`;
  let size: string | null = null;
  if (r2) {
    try {
      const res = await fetch(downloadUrl, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
      const bytes = Number(res.headers.get('content-length'));
      if (res.ok && bytes > 0) size = bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
    } catch {
      /* size is optional */
    }
  }
  return { props: { downloadUrl, size }, revalidate: 3600 };
};

const NumberEgg = ({ n }: { n: number }) => (
  <span className="flex h-8 w-[26px] shrink-0 items-center justify-center bg-yolk font-display text-[13px] font-bold text-ink-on-yolk" style={{ borderRadius: EGG_RADIUS }}>
    {n}
  </span>
);

const STEPS: { title: string; body: React.ReactNode; art: React.ReactNode }[] = [
  {
    title: 'Unzip',
    body: 'Double-click the downloaded file to get the hatch-extension folder.',
    art: (
      <div className="flex items-center gap-[18px]">
        <div className="relative flex h-[88px] w-[70px] items-end justify-center rounded-[12px] border border-line-strong bg-surface-3 pb-2.5">
          <div className="absolute left-[30px] top-0 h-11 w-2.5 bg-[repeating-linear-gradient(#F2A93B_0_6px,#120E0B_6px_12px)]" />
          <span className="font-mono text-[11px] font-semibold text-ink-2">.zip</span>
        </div>
        <svg width="28" height="16" viewBox="0 0 28 16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="text-ink-muted">
          <path d="M2 8h22M18 2l6 6-6 6" />
        </svg>
        <div className="relative h-[68px] w-[86px] rounded-[10px] bg-yolk">
          <div className="absolute -top-2.5 left-0 h-4 w-[38px] rounded-t-[8px] bg-yolk-deep" />
        </div>
      </div>
    ),
  },
  {
    title: 'Open extensions',
    body: (
      <>
        Type <span className="font-mono text-ink">chrome://extensions</span> in the address bar and press Enter.
      </>
    ),
    art: (
      <div className="flex w-full flex-col gap-2.5 rounded-md border border-line bg-surface-2 p-3">
        <div className="flex gap-[5px]">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-[7px] w-[7px] rounded-full bg-line-strong" />
          ))}
        </div>
        <div className="flex h-9 items-center rounded-pill border-[1.5px] border-yolk bg-hatch-bg px-3.5 font-mono text-[13px] font-medium text-ink">
          chrome://extensions<span className="ml-0.5 h-4 w-0.5 animate-pulse bg-yolk" />
        </div>
      </div>
    ),
  },
  {
    title: 'Developer mode on',
    body: 'Flip the switch in the top-right corner of the extensions page.',
    art: (
      <div className="flex w-full items-center justify-between rounded-md border border-line bg-surface-2 p-4">
        <span className="text-sm font-medium text-ink">Developer mode</span>
        <span className="relative block h-[30px] w-[52px] rounded-pill bg-yolk shadow-[0_0_0_6px_rgba(242,169,59,0.15)]">
          <span className="absolute right-1 top-1 h-[22px] w-[22px] rounded-full bg-night" />
        </span>
      </div>
    ),
  },
  {
    title: 'Load unpacked',
    body: 'Pick the unzipped folder. The chicken appears on your next page.',
    art: (
      <div className="relative">
        <span className="flex h-[42px] items-center rounded-[10px] border-[1.5px] border-yolk bg-yolk/10 px-5 text-sm font-semibold text-ink-accent">Load unpacked</span>
        <svg width="26" height="30" viewBox="0 0 24 28" className="absolute left-[62%] top-[62%]">
          <path d="M3 2l17 12-8 1.5 4.5 9-3.5 1.5-4.5-9L3 22z" fill="#F6EEDC" stroke="#120E0B" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </div>
    ),
  },
];

export default function ExtensionPage({ downloadUrl, size }: Props) {
  const mailto = `mailto:?subject=${encodeURIComponent('Hatch for Chrome')}&body=${encodeURIComponent(`Install Hatch on your computer: ${downloadUrl}\n\nThen open chrome://extensions, turn on Developer mode and Load unpacked.`)}`;
  return (
    <Page bleed>
      <Head>
        <title>Get the extension - Hatch</title>
        <meta name="description" content="Hatch for Chrome: a browser buddy that spots coins worth hatching, drafts them with AI, and lets you hatch in one click." />
      </Head>
      <section className="relative">
        <DotField />
        <div className="relative mx-auto flex max-w-[1440px] flex-col-reverse items-start gap-10 px-4 pb-14 pt-10 md:px-10 lg:flex-row lg:items-center lg:px-20 lg:pb-20 lg:pt-[88px]">
          <div className="flex min-w-0 flex-1 flex-col gap-6 md:gap-7">
            <Overline className="hidden text-[12px] text-ink-accent md:block">The browser buddy</Overline>
            <h1 className="max-w-[780px] font-display text-[34px] font-bold leading-[0.95] tracking-[-0.04em] text-ink sm:text-[56px] xl:text-[88px]">A little chicken that spots coins.</h1>
            <p className="max-w-[560px] text-pretty text-[15px] leading-[1.6] text-ink-2 md:text-[18px]">
              It floats on any page. Read about a stock or a tweet and it turns into an egg, drafts a token, explains it in plain words, and lets you hatch in one click.
            </p>
            {/* Desktop browsers: download. Phones: email yourself the link. */}
            <div className="hidden flex-wrap items-center gap-5 md:flex">
              <Button asChild glow className="h-[62px] px-8 text-[17px]">
                <a href={downloadUrl} download>
                  <DownloadIcon size={18} />
                  Download for Chrome
                </a>
              </Button>
              <span className="font-mono text-xs leading-[1.6] text-ink-muted">
                {FILE}
                {size ? ` · ${size}` : ''}
                <br />
                Chrome, Brave, Arc, Edge
              </span>
            </div>
            <div className="flex flex-col gap-3 md:hidden">
              <p className="text-[15px] leading-[1.6] text-ink-2">The buddy runs on desktop Chrome, Brave, Arc and Edge. Send yourself the link, or download on your computer.</p>
              <Button asChild block className="h-[52px]">
                <a href={mailto}>Email me the link</a>
              </Button>
              <span className="font-mono text-xs text-ink-muted">
                {FILE}
                {size ? ` · ${size}` : ''}
              </span>
            </div>
          </div>
          <div className="relative flex h-[120px] w-[120px] shrink-0 items-center justify-center lg:h-[360px] lg:w-[400px]" aria-hidden>
            <div className="absolute hidden h-[360px] w-[360px] rounded-full border border-dashed border-line-strong lg:block" />
            <div className="absolute hidden h-[248px] w-[248px] rounded-full border border-line lg:block" />
            <ChickenOrb size={180} className="hidden motion-safe:animate-pop-in lg:flex" />
            <ChickenOrb size={88} className="lg:hidden" />
            <div className="absolute right-0 top-5 hidden max-w-[200px] animate-rise-in rounded-[16px_16px_16px_4px] bg-shell px-3.5 py-3 text-sm font-medium leading-[1.4] text-night shadow-[0_12px_32px_rgba(0,0,0,0.5)] [animation-delay:400ms] lg:block">
              Psst. I can make a coin out of this.
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1440px] px-4 pb-20 pt-2 md:px-10 lg:px-20 lg:pb-[104px] lg:pt-6" aria-labelledby="steps-h">
        <div className="mb-7 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="steps-h" className="font-display text-[26px] font-bold tracking-[-0.025em] text-ink md:text-4xl">
            Install in 4 steps
          </h2>
          <span className="text-[15px] text-ink-muted">About a minute. Store listing coming soon.</span>
        </div>
        <ol className="grid gap-3 md:grid-cols-2 md:gap-4 xl:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex flex-col overflow-hidden rounded-[24px] border border-surface-3 bg-surface-1 max-md:rounded-[16px]">
              <div className="hidden h-[200px] items-center justify-center border-b border-surface-3 bg-inset px-[22px] md:flex">{s.art}</div>
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
    </Page>
  );
}
