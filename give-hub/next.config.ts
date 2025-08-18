import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Next.js 15: moved from experimental.serverComponentsExternalPackages
  serverExternalPackages: [],
  // Transpile ESM-only packages to avoid dev-time deep import (src.ts) resolution issues
  // with Turbopack/Next dev server when using ethers v6
  transpilePackages: ["ethers", "@noble/curves", "@noble/hashes"],
  // Allow accessing dev server from local network IP to avoid future blocking
  allowedDevOrigins: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://172.20.160.1:3000',
  ],
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
  }
};

export default nextConfig;
