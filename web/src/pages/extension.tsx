import Head from 'next/head';
import type { GetStaticProps } from 'next';
import Page from '@/components/ui/Page/Page';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const EXTENSION_VERSION = '0.1.0';

type Props = { downloadUrl: string };

// The zip lives on the public R2 bucket (the GitHub repo is private for now).
export const getStaticProps: GetStaticProps<Props> = async () => {
  const r2 = (process.env.R2_PUBLIC_URL ?? '').replace(/\/+$/, '');
  const downloadUrl = r2
    ? `${r2}/releases/hatch-extension-v${EXTENSION_VERSION}.zip`
    : `https://github.com/shrooms08/hatch/releases/tag/v${EXTENSION_VERSION}`;
  return { props: { downloadUrl } };
};

const STEPS = [
  'Unzip the download.',
  <>
    Open <code className="rounded bg-neutral-900 px-1.5 py-0.5 text-sm">chrome://extensions</code> in Chrome.
  </>,
  'Turn on Developer mode (top right).',
  'Click Load unpacked and pick the unzipped folder.',
];

export default function ExtensionPage({ downloadUrl }: Props) {
  return (
    <Page>
      <Head>
        <title>Get the extension - Hatch</title>
      </Head>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Hatch for Chrome</h1>
          <p className="mt-2 text-neutral-400">
            A browser buddy that spots pages worth a token, drafts one with AI, and sends you here to launch it with your own wallet.
          </p>
        </div>
        <div>
          <a href={downloadUrl} className={cn(buttonVariants(), 'inline-flex gap-2')} download>
            <span className="iconify h-4 w-4 ph--download-simple-bold" />
            Download Hatch for Chrome
          </a>
          <p className="mt-2 text-xs text-neutral-500">Version {EXTENSION_VERSION} · zip</p>
        </div>
        <ol className="flex flex-col gap-3">
          {STEPS.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                {i + 1}
              </span>
              <span className="text-neutral-200">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </Page>
  );
}
