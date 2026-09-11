import { resolve } from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  turbopack: { root: resolve(import.meta.dirname, "../..") },
  outputFileTracingRoot: resolve(import.meta.dirname, "../.."),
  reactStrictMode: true,
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
