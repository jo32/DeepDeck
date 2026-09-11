import { resolve } from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  turbopack: { root: resolve(import.meta.dirname, "../..") },
  outputFileTracingRoot: resolve(import.meta.dirname, "../.."),
  reactStrictMode: true,
  async rewrites() {
    // Route older desktop clients to the same live service, ahead of public assets.
    return { beforeFiles: [{ source: '/webmcp/catalog.json', destination: '/api/webmcp/catalog' }] };
  },
  async redirects() {
    return [
      {
        source: "/en",
        destination: "/",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
