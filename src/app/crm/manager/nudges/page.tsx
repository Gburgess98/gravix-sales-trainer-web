import UnavailableRoute from '@/components/UnavailableRoute'

// Withheld from this release (src/config/release-hidden.ts). The original page (a server component that fetched
// ${INTERNAL_API_BASE_URL ?? "http://localhost:3000"}/api/proxy/... on every request) now lives in src/withheld/ and is imported by
// nothing. This page does no work at all: it is prerendered once at build time, so a request runs no server code and sends no fetch.
export const dynamic = 'force-static'

export default function Page() {
  return <UnavailableRoute />
}
