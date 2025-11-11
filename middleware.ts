import { NextRequest, NextResponse } from 'next/server'

// Run globally so we can stamp headers wherever needed.
// We only ACT on "/", "/probe", "/crm/overview", "/recent-calls".
export const config = { matcher: ['/:path*'] }

export function middleware(req: NextRequest) {
  const url = req.nextUrl

  // Pass-through helper with probe headers for debugging
  const pass = (extra: Record<string, string> = {}) => {
    const res = NextResponse.next()
    res.headers.set('x-mw-probe', 'root-mw-active')
    res.headers.set('x-config-probe', 'next-config-root')
    for (const [k, v] of Object.entries(extra)) res.headers.set(k, v)
    return res
  }

  // 1) /probe → no rewrite, just headers so we can confirm middleware ran
  if (url.pathname === '/probe') return pass()

  // 2) Mark CRM Overview + Recent Calls as "open" so any guards skip redirects
  if (url.pathname === '/crm/overview' || url.pathname === '/recent-calls') {
    return pass({ 'x-open-route': '1' })
  }

  // 3) Handle "/?redirect=/path" ONLY on the root path
  if (url.pathname === '/') {
    const r = url.searchParams.get('redirect')
    if (r && r.startsWith('/') && r !== '/') {
      // single hop; strip query entirely
      return NextResponse.redirect(new URL(r, url.origin), 307)
    }
    return pass()
  }

  // 4) Everything else → transparent pass
  return pass()
}