// Open Graph / X card tags. _app renders the site defaults; a page renders its own with the same keys,
// and next/head keeps the last one per key.
import Head from 'next/head';

/** Absolute site origin: https://hatchem.fun in production, the deployment on previews, '' locally (next.config env). */
export const SITE_ORIGIN = process.env.HATCH_SITE_ORIGIN || '';

export const DEFAULT_SOCIAL = {
  title: 'Hatch · Launch anything you see',
  description: 'Launch anything you see. A browser buddy that turns news, memes, AI agents and stocks into coins on Meteora DBC, with a built-in sniper shield.',
  image: `${SITE_ORIGIN}/og.png`,
};

export function SocialMeta({ title, description, image, url, type = 'website' }: { title: string; description: string; image: string; url?: string; type?: string }) {
  return (
    <Head>
      <meta key="description" name="description" content={description} />
      <meta key="og:type" property="og:type" content={type} />
      <meta key="og:title" property="og:title" content={title} />
      <meta key="og:description" property="og:description" content={description} />
      {url && <meta key="og:url" property="og:url" content={url} />}
      {url && <link key="canonical" rel="canonical" href={url} />}
      <meta key="og:image" property="og:image" content={image} />
      <meta key="og:image:width" property="og:image:width" content="1200" />
      <meta key="og:image:height" property="og:image:height" content="630" />
      <meta key="twitter:title" name="twitter:title" content={title} />
      <meta key="twitter:description" name="twitter:description" content={description} />
      <meta key="twitter:image" name="twitter:image" content={image} />
    </Head>
  );
}
