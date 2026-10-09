import path from 'node:path';
import type { NextConfig } from 'next';

// Host of the public R2 bucket (token images), for next/image. Read from env at build time.
function r2RemotePattern() {
  try {
    const url = new URL(process.env.R2_PUBLIC_URL ?? '');
    return [{ protocol: url.protocol.replace(':', '') as 'http' | 'https', hostname: url.hostname }];
  } catch {
    return [];
  }
}

// The canonical public site. hatchfun.vercel.app keeps serving the same app (its /api/* is used by the
// published extension 0.6.2), but links, canonical tags, share cards and Action URLs name hatchem.fun.
const CANONICAL_ORIGIN = 'https://hatchem.fun';
// Absolute origin for social previews (og:image must be absolute): the canonical domain in production,
// else this deployment (previews), '' locally. HATCH_SITE_ORIGIN set in the environment wins.
const SITE_ORIGIN =
  process.env.HATCH_SITE_ORIGIN ||
  (process.env.VERCEL_ENV === 'production' ? CANONICAL_ORIGIN : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');

const nextConfig: NextConfig = {
  env: { HATCH_SITE_ORIGIN: SITE_ORIGIN },
  /* config options here */
  reactStrictMode: true,
  devIndicators: false,
  // `pnpm dev:mainnet` builds into .next-mainnet so it can run beside the devnet dev server.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // web/ is its own app; pin the root so the scripts/ lockfile isn't picked up.
  turbopack: { root: path.resolve(__dirname) },
  outputFileTracingRoot: path.resolve(__dirname),
  images: { remotePatterns: r2RemotePattern() },
  // Solana Actions: /actions.json must sit at the site root (served by an API route for its CORS headers).
  async rewrites() {
    return [{ source: '/actions.json', destination: '/api/actions-json' }];
  },
  // Fallback token images: native renderer + the bundled font file.
  serverExternalPackages: ['@resvg/resvg-js'],
  outputFileTracingIncludes: { '/api/**/*': ['./assets/fonts/**/*'] },
  // Type errors fail the build. ESLint is run separately (`pnpm lint`).
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
