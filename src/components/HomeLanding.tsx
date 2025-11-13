// src/app/page.tsx (server component)
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function isSafePath(p: string) {
  return typeof p === 'string' && p.startsWith('/') && !p.startsWith('//')
}

function hasSbSessionFromCookies() {
  // Mirror middleware logic: look for sb-/supabase- cookies that include auth/access/refresh
  const names = cookies().getAll().map(c => c.name)
  return names.some(n =>
    (/^(sb-|supabase-)/.test(n) && /(auth|access|refresh)/.test(n)) ||
    n === 'sb-access-token' || n === 'sb-auth-token'
  )
}

// Mirror the middleware allow-list so home can redirect to public targets even if unauth'd
const OPEN_ROUTES = (process.env.NEXT_PUBLIC_OPEN_ROUTES || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

function isPublicPath(pathname: string) {
  return OPEN_ROUTES.some(prefix => pathname === prefix || pathname.startsWith(prefix + '/'));
}

export default function Home({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined }
}) {
  const destRaw = (searchParams?.redirect ?? '') as string
  const authed = hasSbSessionFromCookies()
  if (destRaw) {
    const dest = decodeURIComponent(destRaw)
    if (isSafePath(dest) && dest !== '/') {
      const destPath = new URL(dest, 'https://dummy.local').pathname
      // If target is public (e.g., /crm or /recent-calls), ALWAYS redirect; otherwise require auth
      if (isPublicPath(destPath) || authed) {
        redirect(dest)
      }
    }
  }

  return (
    <main className="p-8">
      <h1 className="text-xl font-semibold mb-4">Gravix</h1>
      <p className="text-sm text-white/60 mb-6">Welcome. Use the links below to navigate.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/recent-calls" className="block" data-testid="nav-recent-calls">
          <div className="w-full rounded-lg border border-white/20 px-4 py-3 hover:bg-white/5">Recent Calls</div>
        </Link>
        <Link href="/crm/overview" className="block" data-testid="nav-crm-overview">
          <div className="w-full rounded-lg border border-white/20 px-4 py-3 hover:bg-white/5">CRM Overview</div>
        </Link>
        <Link href="/proxy/health" className="block" data-testid="nav-proxy-health">
          <div className="w-full rounded-lg border border-white/20 px-4 py-3 hover:bg-white/5">Proxy Health</div>
        </Link>
      </div>
    </main>
  )
}