'use client'

import { usePathname, useSearchParams } from 'next/navigation'
import { Menu, LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase-browser'
import { useSession } from '@/lib/useSession'
import { navigation } from '@/config/navigation'
import { collectNavHrefs, isNavItemActive, resolveNavItem, type NavSearch } from '@/config/nav-model'

const NAV_HREFS = collectNavHrefs(navigation)

interface TopbarProps {
  isManager?: boolean
  onMobileMenuOpen: () => void
}

function getBreadcrumb(pathname: string, search: NavSearch, isManager: boolean): string {
  // Walk nav sections to find a matching label. Query-aware (Day 45) so the title
  // agrees with the sidebar: /call-library → Calls, /call-library?tab=sparring → Sparring.
  for (const section of navigation) {
    for (const item of section.items) {
      if (isNavItemActive(item.href, pathname, search, NAV_HREFS)) {
        return resolveNavItem(item, isManager).label
      }
    }
  }
  // Fallback: capitalise the last human path segment (skip UUID-like ids so
  // detail pages never show a raw identifier in the breadcrumb).
  const UUIDISH = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i
  const segment =
    pathname.split('/').filter(Boolean).filter((s) => !UUIDISH.test(s)).pop() ?? ''
  return segment
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function Topbar({ onMobileMenuOpen, isManager = false }: TopbarProps) {
  const pathname = usePathname() ?? ''
  const { session } = useSession()
  const searchParams = useSearchParams()
  const breadcrumb = getBreadcrumb(pathname, searchParams, isManager)

  const logout = async () => {
    try {
      await supabase.auth.signOut()
    } catch {}
    try {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (!k) continue
        if (k.includes('auth-token') || k.startsWith('sb-') || k === 'gravix_user_id') keys.push(k)
      }
      keys.forEach((k) => localStorage.removeItem(k))
    } catch {}
    window.location.href = '/login'
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-neutral-800/60 bg-neutral-950/70 backdrop-blur-xl px-4 lg:px-8">
      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={onMobileMenuOpen}
        className="lg:hidden -ml-1 flex h-10 w-10 items-center justify-center rounded-md text-neutral-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/70"
        aria-label="Open menu"
      >
        <Menu size={20} aria-hidden />
      </button>

      {/* Breadcrumb */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-neutral-100 truncate">
          {breadcrumb}
        </span>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-3">
        {/* User email */}
        {session?.user?.email && (
          <span className="hidden md:block text-xs text-neutral-500 max-w-[180px] truncate">
            {session.user.email}
          </span>
        )}

        {/* Logout */}
        {session && (
          <button
            type="button"
            onClick={logout}
            className="flex h-10 w-10 items-center justify-center rounded-md text-neutral-400 hover:text-neutral-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/70"
            title="Log out"
            aria-label="Log out"
            data-testid="nav-logout"
          >
            <LogOut size={16} aria-hidden />
          </button>
        )}
      </div>
    </header>
  )
}
