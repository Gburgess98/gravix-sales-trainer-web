import { NextRequest, NextResponse } from 'next/server';

// ✅ Only run on "/" and "/probe" so we never touch normal pages (prevents loops)
export const config = { matcher: ['/', '/probe'] };

export function middleware(req: NextRequest) {
  const url = req.nextUrl;

  // Always add probe headers so we can verify middleware is active in prod
  const pass = () => {
    const res = NextResponse.next();
    res.headers.set('x-mw-probe', 'root-mw-active');
    res.headers.set('x-config-probe', 'next-config-root');
    return res;
  };

  // Let /probe through unmodified (handy for curl checks)
  if (url.pathname === '/probe') {
    return pass();
  }

  // Handle "/?redirect=/path" only when we're on the root path
  // Issue a single 307 to the safe, absolute path and strip the query
  if (url.pathname === '/') {
    const redirectParam = url.searchParams.get('redirect');
    if (redirectParam && redirectParam.startsWith('/') && redirectParam !== '/') {
      const target = new URL(redirectParam, url.origin);
      return NextResponse.redirect(target, 307);
    }
    return pass();
  }

  // Fallback (shouldn't run due to matcher), keep headers consistent
  return pass();
}