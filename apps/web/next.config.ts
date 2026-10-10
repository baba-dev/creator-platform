import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const directory = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(directory, "../.."),
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: [
    "@aiwa/core",
    "@aiwa/ui",
    "@aiwa/organizations",
    "@aiwa/payments",
    "@aiwa/generation",
  ],
  typedRoutes: true,
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "no-cache, max-age=0" }],
      },
      {
        source: "/offline.html",
        headers: [{ key: "Cache-Control", value: "no-cache, max-age=0" }],
      },
    ];
  },
  experimental: {
    ...(process.env.CI ? { cpus: 2 } : {}),
  },
};

export default nextConfig;
