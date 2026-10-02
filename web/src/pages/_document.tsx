import { Html, Head, Main, NextScript } from 'next/document';
import { ENABLE_JUPITER_DATA } from '@/lib/config/network';

export default function Document() {
  return (
    <Html lang="en" suppressHydrationWarning>
      <Head>
        {/* Jupiter Plugin (feature-flagged), see https://dev.jup.ag/docs/tool-kits/plugin */}
        {ENABLE_JUPITER_DATA && <script src="https://plugin.jup.ag/plugin-v1.js" data-preload defer />}
      </Head>
      <body className="antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
