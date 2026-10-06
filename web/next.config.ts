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

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: true,
  // web/ is its own app; pin the root so the scripts/ lockfile isn't picked up.
  turbopack: { root: path.resolve(__dirname) },
  outputFileTracingRoot: path.resolve(__dirname),
  images: { remotePatterns: r2RemotePattern() },
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
