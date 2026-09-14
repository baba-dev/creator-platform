import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const directory = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(directory, "../.."),
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@aiwa/core", "@aiwa/ui"],
  typedRoutes: true,
};

export default nextConfig;
