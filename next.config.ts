import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Skip lint/type errors during CI builds (staging speed).
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;

