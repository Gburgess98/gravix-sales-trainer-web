import { NextRequest, NextResponse } from 'next/server'

// Run globally (cheap) — we only ACT on specific paths.
export const config = { matcher: ['/:path*'] }

export function middleware(req: NextRequest) {
  const url = req.nextUrl

  // Helper: transparent pass-through with debug response headers
  const pass = (extra: Record<string, string> = {}) => {
    const res = NextResponse.next()
    res.headers.set('x-mw-probe', 'root-mw-active')
    res.headers.set('x-config-probe', 'next-config-root')
    for (const [k, v] of Object.entries(extra)) res.headers.set(k, v)
    return res
  }

  // Helper: pass-through but also INJECT a request header that pages can read via next/headers()
  const passWithOpenRoute = () => {
    const requestHeaders = new Headers(req.headers)
    requestHeaders.set('x-open-route', '1') // <-- this is the important bit
    const res = NextResponse.next({ request: { headers: requestHeaders } })
    // keep the probe headers on the response for debugging
    res.headers.set('x-mw-probe', 'root-mw-active')
    res.headers.set('x-config-probe', 'next-config-root')
    res.headers.set('x-open-route', '1')
    return res
  }

  // 1) Health probe — no rewrite, just markers
  if (url.pathname === '/probe') return pass()

  // 2) Mark CRM Overview + Recent Calls as "open"
  if (url.pathname === '/crm/overview' || url.pathname === '/recent-calls') {
    return passWithOpenRoute()
  }

  // 3) Handle "/?redirect=/path" ONLY on home
  if (url.pathname === '/') {
    const r = url.searchParams.get('redirect')
    if (r && r.startsWith('/') && r !== '/') {
      // Single clean hop, strip the query entirely
      return NextResponse.redirect(new URL(r, url.origin), 307)
    }
    return pass()
  }

  // 4) Everything else — transparent pass
  return pass()
}