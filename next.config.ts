import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Reduce console noise in production
  logging: {
    fetches: {
      fullUrl: false,
      hmrRefreshes: false,
    },
  },
  // Disable request logging in development
  experimental: {
    logging: {
      level: 'error', // Only show errors, not info/debug
    },
  },
  // Suppress some warnings
  onDemandEntries: {
    // Period (in ms) where the server will keep pages in the buffer
    maxInactiveAge: 25 * 1000,
    // Number of pages that should be kept simultaneously without being disposed
    pagesBufferLength: 2,
  },
};

export default nextConfig;
