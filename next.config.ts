import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Safe bundle optimization - only package imports
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
