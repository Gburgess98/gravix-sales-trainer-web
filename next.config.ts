import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // keep your existing options (eslint/typescript/etc) here…

  async rewrites() {
    return [
      // Force the base path to a route we know resolves
      { source: "/api/proxy", destination: "/api/proxy/index.html" },
      // Also normalize with trailing slash just in case
      { source: "/api/proxy/", destination: "/api/proxy/index.html" },
    ];
  },
};

export default nextConfig;
