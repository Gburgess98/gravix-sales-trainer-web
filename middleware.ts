import { NextRequest, NextResponse } from 'next/server';

// Run only where we act:
//  - "/" to handle ?redirect=/path
//  - "/probe" for health checks
//  - "/crm/overview" and "/recent-calls" to stamp an "open route" header
export const config = { matcher: ['/', '/probe', '/crm/overview', '/recent-calls'] };

export function middleware(req: NextRequest) {
  const url = req.nextUrl;

  const pass = (extra: Record<string, string> = {}) => {
    const res = NextResponse.next();
    res.headers.set('x-mw-probe', 'root-mw-active');
    res.headers.set('x-config-probe', 'next-config-root');
    for (const [k, v] of Object.entries(extra)) res.headers.set(k, v);
    return res;
  };

  // Let /probe through with probe headers
  if (url.pathname === '/probe') return pass();

  // Mark these as "open" so any guard skips auth redirects
  if (url.pathname === '/crm/overview' || url.pathname === '/recent-calls') {
    return pass({ 'x-open-route': '1' });
  }

  // Handle "/?redirect=/path" only on the home route
  if (url.pathname === '/') {
    const redirectParam = url.searchParams.get('redirect');
    if (redirectParam && redirectParam.startsWith('/') && redirectParam !== '/') {
      return NextResponse.redirect(new URL(redirectParam, url.origin), 307);
    }
    return pass();
  }

  // Shouldn't be reached due to matcher
  return pass();
}