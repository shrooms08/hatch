// /privacy: what Hatch (web app + extension) reads, sends, stores and never collects. Kept in line with
// the code: extension lib/page.ts, lib/api.ts (stripUrl), lib/newsMatch.ts, lib/storage.ts; web
// lib/server/rateLimit.ts, lib/onboarding.ts, /api/*.
import Head from 'next/head';
import Link from 'next/link';
import Page from '@/components/ui/Page/Page';
import { Card, Overline } from '@/components/ds';

const REPO_ISSUES = 'https://github.com/shrooms08/hatch/issues';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-3 rounded-[20px] p-5 md:p-7">
      <h2 className="font-display text-[20px] font-bold tracking-[-0.02em] text-ink md:text-[24px]">{title}</h2>
      <div className="flex flex-col gap-2.5 text-[15px] leading-[1.6] text-ink-2 [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-semibold [&_strong]:text-ink">{children}</div>
    </Card>
  );
}

const ext = (href: string, label: string) => (
  <a href={href} target="_blank" rel="noreferrer" className="font-semibold text-ink-accent underline-offset-4 hover:underline">
    {label}
  </a>
);

export default function PrivacyPage() {
  return (
    <Page containerClassName="md:pt-10">
      <Head>
        <title>Privacy - Hatch</title>
        <meta name="description" content="What Hatch and its Chrome extension read, send and store, in plain words." />
      </Head>
      <div className="mx-auto flex w-full max-w-[820px] flex-col gap-5 md:gap-6">
        <div className="flex flex-col gap-3">
          <Overline className="text-ink-accent">Privacy</Overline>
          <h1 className="font-display text-[36px] font-bold leading-none tracking-[-0.04em] text-ink md:text-[56px]">Plain and short.</h1>
          <p className="text-[16px] leading-[1.6] text-ink-2">
            Hatch has no accounts and keeps no browsing history. This page says exactly what the website and the Chrome extension read, where it goes, and what stays on your device. Last updated October 9, 2026.
          </p>
        </div>

        <Section title="What the extension reads, and when">
          <ul>
            <li>
              <strong>Stock pages and tweets, automatically.</strong> Once per page, it sends the page address without anything after <code>?</code> or <code>#</code>, the page title and a short excerpt of the text (up to 1,500 characters), so the chicken can offer an idea. Opening the side panel on these pages drafts right away, which sends the title, address, visible text (up to 6,000 characters) and image links.
            </li>
            <li>
              <strong>News headlines, on your device only.</strong> On other pages the extension compares the page title and main headline with the stock names Hatch supports. That check never leaves your browser. If it matches, the chicken shows a hint; nothing is sent unless you click it.
            </li>
            <li>
              <strong>Every other page: only when you ask.</strong> Nothing is sent until you click the hint or &ldquo;Draft from this page&rdquo;. Then the title, address, visible text and image links go to Hatch to write the draft.
            </li>
            <li>You can turn automatic noticing off in the side panel&apos;s Settings.</li>
          </ul>
        </Section>

        <Section title="Where it goes">
          <ul>
            <li>
              <strong>Hatch&apos;s server</strong> (the web app on Vercel) receives the requests above. It does not store page content.
            </li>
            <li>
              <strong>Anthropic&apos;s API</strong> writes drafts and hints from that page content. See {ext('https://www.anthropic.com/legal/privacy', "Anthropic's privacy policy")}.
            </li>
            <li>
              <strong>Blockchain reads</strong> (balances, pools, sending your signed transactions) go through Hatch&apos;s server to Helius. See {ext('https://www.helius.dev/privacy-policy', "Helius's privacy policy")}.
            </li>
            <li>
              <strong>Images and token metadata</strong> you launch are stored on Cloudflare R2 and are public.
            </li>
            <li>
              <strong>Pay with SOL</strong> asks Jupiter for a swap quote and instructions from your browser, which includes your public wallet address.
            </li>
            <li>
              Page images in drafts are fetched by Hatch&apos;s server, so the image&apos;s site sees Hatch, not you.
            </li>
          </ul>
        </Section>

        <Section title="What is stored">
          <ul>
            <li>
              <strong>No accounts, no browsing history.</strong> There is no sign-up and no analytics.
            </li>
            <li>
              <strong>In the extension&apos;s storage, on your device:</strong> your public wallet address (reported by this website after you connect), your settings, the buddy&apos;s position, a cached list of your launches and their milestones, and which pages it already noticed this session.
            </li>
            <li>
              <strong>In this website&apos;s storage, on your device:</strong> whether you saw the walkthrough and tips, your theme, and your wallet choice.
            </li>
            <li>
              <strong>On Hatch&apos;s server:</strong> rate limits use your IP address, kept briefly in memory and not saved.
            </li>
            <li>
              <strong>On the blockchain:</strong> tokens you launch, their metadata and every trade are public and permanent.
            </li>
          </ul>
        </Section>

        <Section title="What is never collected">
          <ul>
            <li>Private keys and recovery phrases. Your wallet signs; Hatch never sees its secrets.</li>
            <li>Hatch never signs for you and never holds your funds.</li>
          </ul>
        </Section>

        <Section title="Your controls">
          <ul>
            <li>
              <strong>Notice pages automatically</strong>, <strong>Sounds</strong> and <strong>Chirp on heads-ups and alerts</strong> toggles in the side panel&apos;s Settings.
            </li>
            <li>
              <strong>Hide on this site</strong> and <strong>Hide everywhere</strong> from the chicken&apos;s ⋯ menu.
            </li>
            <li>
              <strong>Clear my data</strong> in Settings removes everything the extension stored.
            </li>
            <li>Uninstalling the extension removes its storage too.</li>
          </ul>
        </Section>

        <Section title="Contact">
          <p>
            Questions or a problem? Open an issue on {ext(REPO_ISSUES, 'GitHub')}. More on the extension: <Link href="/extension" className="font-semibold text-ink-accent underline-offset-4 hover:underline">Get the extension</Link>.
          </p>
        </Section>
      </div>
    </Page>
  );
}
