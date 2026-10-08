import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en" suppressHydrationWarning>
      <Head>
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="theme-color" content="#120E0B" />
        <meta property="og:site_name" content="Hatch" />
        <meta name="twitter:card" content="summary_large_image" />
        {/* Title, description and image are per page: components/SocialMeta (defaults in _app). */}
      </Head>
      <body className="bg-hatch-bg antialiased">
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
