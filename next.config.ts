import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // keep your existing options (eslint/typescript/etc) here…

  async rewrites() {
  return [
    { source: "/api/proxy",  destination: "/api/proxy" },
    { source: "/api/proxy/", destination: "/api/proxy" },
  ];
},
};

export default nextConfig;
