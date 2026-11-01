import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // .next/standalone (server.js + traced node_modules) is what the Docker web image runs.
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
