import { NextRequest, NextResponse } from 'next/server'

// ---- Kill switch (set NEXT_PUBLIC_DISABLE_GUARD=1 to bypass middleware entirely) ----
const DISABLE_GUARD = process.env.NEXT_PUBLIC_DISABLE_GUARD === '1'

// ---- Built‑in public prefixes (ALWAYS public) + env allow‑list ----
const PUBLIC_PREFIXES = ['/crm', '/recent-calls'] as const
const ENV_OPEN = (process.env.NEXT_PUBLIC_OPEN_ROUTES || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

const OPEN_ROUTES = Array.from(new Set<string>([...PUBLIC_PREFIXES, ...ENV_OPEN]))

// ---- Helpers ----
const isSafePath = (p: string) => typeof p === 'string' && p.startsWith('/') && !p.startsWith('//')
const isPublicPath = (p: string) => OPEN_ROUTES.some(prefix => p === prefix || p.startsWith(prefix + '/'))

function withDebug(res: NextResponse, info: Record<string, string | number | boolean | undefined>) {
  try {
    res.headers.set('x-mw-probe', 'root') // unmistakable probe header
    res.headers.set('x-mw-openroutes', OPEN_ROUTES.join('|') || '-')
    Object.entries(info).forEach(([k, v]) => {
      if (v !== undefined) res.headers.set(`x-mw-${k}`, String(v))
    })
  } catch {}
  return res
}

export function middleware(req: NextRequest) {
  if (DISABLE_GUARD) return withDebug(NextResponse.next(), { reason: 'disabled' })

  const url = new URL(req.url)
  const path = url.pathname

  // 1) Handle root with ?redirect=/path (only to safe, public targets to avoid loops)
  if (path === '/' && url.searchParams.has('redirect')) {
    const target = url.searchParams.get('redirect') || '/'
    const safe = isSafePath(target)
    const pub = safe && isPublicPath(target)

    if (safe && pub && target !== '/') {
      const to = new URL(target, url.origin)
      return withDebug(NextResponse.redirect(to, { status: 302 }), {
        reason: 'redirect-param', target: to.pathname, public: true,
      })
    }

    // Not public or not safe → do nothing (let the page decide)
    return withDebug(NextResponse.next(), { reason: 'redirect-param-ignored', target })
  }

  // 2) Always pass for OPEN routes
  if (isPublicPath(path)) {
    return withDebug(NextResponse.next(), { reason: 'pass', public: true, path })
  }

  // 3) Normalize base API proxy path so it never 404s on Vercel
  if (path === '/api/proxy' || path === '/api/proxy/') {
    url.pathname = '/api/proxy'
    return withDebug(NextResponse.rewrite(url), { reason: 'proxy-rewrite' })
  }

  // 4) Everything else → pass through; app handles auth/gating server‑side
  return withDebug(NextResponse.next(), { reason: 'pass', public: false, path })
}

export const config = {
  matcher: [
    '/((?!_next/|favicon.ico|assets/|static/).*)',
    '/api/proxy',
    '/api/proxy/',
  ],
}