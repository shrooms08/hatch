import { Html, Head, Main, NextScript } from 'next/document';
import { ENABLE_JUPITER_DATA } from '@/lib/config/network';

// Social previews need an absolute URL: the production domain on Vercel, else this deployment.
const SITE = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
const OG_IMAGE = SITE ? `https://${SITE}/og.png` : '/og.png';

export default function Document() {
  return (
    <Html lang="en" suppressHydrationWarning>
      <Head>
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#120E0B" />
        <meta name="description" content="Launch anything you see. Stock-paired token launches on Meteora's Dynamic Bonding Curve, on Solana." />
        <meta property="og:site_name" content="Hatch" />
        <meta property="og:type" content="website" />
        <meta property="og:title" content="Hatch · Launch anything you see" />
        <meta property="og:description" content="Hatch a coin whose pool is priced in tokenized stock. Pay with SOL; we swap it for you." />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content={OG_IMAGE} />
        {/* Jupiter Plugin (feature-flagged), see https://dev.jup.ag/docs/tool-kits/plugin */}
        {ENABLE_JUPITER_DATA && <script src="https://plugin.jup.ag/plugin-v1.js" data-preload defer />}
      </Head>
      <body className="bg-hatch-bg antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
