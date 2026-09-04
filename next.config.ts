import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,

  async headers() {
    return [
      // Home page — force fresh HTML (avoid stale cached root)
      {
        source: '/',
        headers: [
          { key: 'x-config-probe', value: 'next-config-root' },
          { key: 'cache-control', value: 'no-store' },
        ],
      },
      // All routes — add probe header + also disable edge caching temporarily
      {
        source: '/:path*',
        headers: [
          { key: 'x-config-probe', value: 'next-config-root' },
          { key: 'cache-control', value: 'no-store' },
        ],
      },
    ]
  },
}

export default nextConfig