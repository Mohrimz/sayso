import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Every page here is per-user and reads the session, so it streams behind a
    // loading state by design. Only validate segments that opt in with `instant`.
    instantInsights: { validationLevel: "manual-warning" },
  },
  turbopack: {
    root: __dirname,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
