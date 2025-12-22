import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  // Output as standalone for Vercel deployment
  output: 'standalone',

  // Fix lockfile detection warning
  outputFileTracingRoot: path.join(__dirname),

  // Hide the dev indicator
  devIndicators: false,

  // Image domains for R2/external images
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.r2.dev',
      },
      {
        protocol: 'https',
        hostname: 'static-assets.artlogic.net',
      },
    ],
  },
};

export default nextConfig;
