// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,

  async headers() {
    return [
      // Home: force dynamic fetch + add probe
      {
        source: '/',
        headers: [
          { key: 'x-config-probe', value: 'next-config-root' },
          { key: 'cache-control', value: 'no-store' },
        ],
      },
      // All other routes: add probe header so we can see this config is live
      {
        source: '/:path*',
        headers: [
          { key: 'x-config-probe', value: 'next-config-root' },
        ],
      },
    ]
  },
}

export default nextConfig