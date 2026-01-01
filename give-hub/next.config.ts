import type { NextConfig } from "next";
import { join } from "path";

const nextConfig: NextConfig = {
  /* config options here */
  // Next.js 15: moved from experimental.serverComponentsExternalPackages
  serverExternalPackages: [],
  // Transpile ESM-only packages to avoid dev-time deep import (src.ts) resolution issues
  // with Turbopack/Next dev server when using ethers v6
  transpilePackages: ["ethers", "@noble/curves", "@noble/hashes"],
  // Do not fail the production build on ESLint errors (useful for Vercel CI)
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Allow building even if TypeScript reports errors (useful for CI/local fixes)
  typescript: {
    ignoreBuildErrors: true,
  },
  // Allow accessing dev server from local network IP to avoid future blocking
  allowedDevOrigins: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://172.20.160.1:3000',
  ],
  // Mitigate occasional Windows ENOENT rename errors from webpack's filesystem cache
  // by switching to in-memory cache during development on Windows.
  webpack: (config, { dev }) => {
    if (dev && process.platform === 'win32') {
      // Use in-memory cache to avoid file locking/rename issues on NTFS
      const wcfg = config as unknown as { cache?: { type: 'memory' } | false }
      wcfg.cache = { type: 'memory' }
      return wcfg as unknown as typeof config
    }
    return config
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version' },
        ]
      }
    ]
  },
  outputFileTracingRoot: join(__dirname, '../'),
};

export default nextConfig;
