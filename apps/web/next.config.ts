import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@pabox/sdk', '@pabox/crypto', '@pabox/types'],
};

export default nextConfig;
