import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: false,
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: ["*.e2b.app"],
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
