import { NextRequest, NextResponse } from 'next/server'


// Treat localhost as "authed" during local dev to avoid redirect loops
function isLocalhost(u: URL) {
  return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
}

// ---- Configurable allow-list for public routes (comma-separated prefixes) ----
// Example: NEXT_PUBLIC_OPEN_ROUTES="/crm,/recent-calls"
const OPEN_ROUTES = (process.env.NEXT_PUBLIC_OPEN_ROUTES || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

// ---- Helpers ----
function isSafePath(p: string) {
  return typeof p === 'string' && p.startsWith('/') && !p.startsWith('//')
}

function isPublicPath(p: string) {
  return OPEN_ROUTES.some(prefix => p === prefix || p.startsWith(prefix + '/'))
}

function hasSession(req: NextRequest) {
  const names = req.cookies.getAll().map(c => c.name)
  return names.some(n =>
    (/^(sb-|supabase-)/.test(n) && /(auth|access|refresh)/.test(n)) ||
    n === 'sb-access-token' || n === 'sb-auth-token'
  )
}

function withDebug(res: NextResponse, info: Record<string, string | number | boolean | undefined>) {
  try {
    res.headers.set('x-mw-probe', 'root')
    res.headers.set('x-mw-openroutes', OPEN_ROUTES.join('|') || '-')
    Object.entries(info).forEach(([k, v]) => {
      if (v !== undefined) res.headers.set(`x-mw-${k}`, String(v))
    })
  } catch {}
  return res
}
const DISABLE_GUARD = process.env.NEXT_PUBLIC_DISABLE_GUARD === '1';
const REDIRECT_MATCH = /^\/$/
const PROXY_BASES = new Set(['/api/proxy', '/api/proxy/'])
const PROTECTED = [
  /^\/recent-calls/,
  /^\/calls\//,
  /^\/crm/,
  /^\/admin/,
  /^\/assignments/,
  /^\/upload$/,
  /^\/reps/,
  /^\/sparring/,
]

export function middleware(req: NextRequest) {
  if (DISABLE_GUARD) {
    return withDebug(NextResponse.next(), { reason: 'disabled' });
  }
  const url = req.nextUrl.clone()
  const path = url.pathname
  const local = isLocalhost(url)

  // 1) Handle ?redirect= globally on root — allow when authed or when target is public
  const redirectParam = url.searchParams.get('redirect')
  if (redirectParam && REDIRECT_MATCH.test(path)) {
    const target = decodeURIComponent(redirectParam)
    const isSafe = isSafePath(target) && target !== '/'
    const authed = hasSession(req) || local
    if (isSafe) {
      const targetPath = new URL(target, url.origin).pathname
      if (authed || isPublicPath(targetPath)) {
        const to = new URL(target, url.origin)
        return withDebug(NextResponse.redirect(to, { status: 307 }), {
          reason: 'redirect-param', target: to.pathname, authed, public: isPublicPath(targetPath)
        })
      }
    }
  }

  // 2) Normalize base API proxy path so it never 404s on Vercel
  if (PROXY_BASES.has(path)) {
    url.pathname = '/api/proxy'
    return withDebug(NextResponse.rewrite(url), { reason: 'proxy-rewrite' })
  }

  // 3) Gate protected paths, except when allow-listed as public
  const needsAuth = PROTECTED.some(re => re.test(path)) && !isPublicPath(path)
  if (!needsAuth) {
    return withDebug(NextResponse.next(), { reason: 'pass', path, public: isPublicPath(path) })
  }

  const authed = hasSession(req) || local
  if (!authed) {
    const home = new URL('/', url.origin)
    // include original target for post-login
    home.searchParams.set('redirect', encodeURIComponent(path + (url.search || '')))
    home.searchParams.set('rd', url.searchParams.get('rd') || '1')
    return withDebug(NextResponse.redirect(home, { status: 307 }), {
      reason: 'gate-unauth', path, target: home.pathname + home.search
    })
  }

  return withDebug(NextResponse.next(), { reason: 'authed', path })
}

export const config = {
  matcher: [
    '/((?!_next/|favicon.ico|assets/|static/|api/).*)',
    '/api/proxy',
    '/api/proxy/',
  ],
}