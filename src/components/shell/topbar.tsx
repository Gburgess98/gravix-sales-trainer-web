'use client'

import { usePathname } from 'next/navigation'
import { Menu, Bell, LogOut } from 'lucide-react'
import { clsx } from 'clsx'
import { supabase } from '@/lib/supabase-browser'
import { useSession } from '@/lib/useSession'
import { navigation } from '@/config/navigation'

interface TopbarProps {
  onMobileMenuOpen: () => void
}

function getBreadcrumb(pathname: string): string {
  // Walk nav sections to find a matching label
  for (const section of navigation) {
    for (const item of section.items) {
      if (
        item.href === pathname ||
        (item.href !== '/' && pathname.startsWith(item.href + '/'))
      ) {
        return item.label
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

export function Topbar({ onMobileMenuOpen }: TopbarProps) {
  const pathname = usePathname()
  const { session } = useSession()
  const breadcrumb = getBreadcrumb(pathname)

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
    <header className="flex h-12 shrink-0 items-center border-b border-neutral-800 bg-neutral-950 px-4 gap-4">
      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={onMobileMenuOpen}
        className="lg:hidden text-neutral-400 hover:text-white"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {/* Breadcrumb */}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-neutral-200 truncate">
          {breadcrumb}
        </span>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-3">
        {/* Notifications placeholder */}
        <button
          type="button"
          className="text-neutral-500 hover:text-neutral-300 transition-colors"
          title="Notifications"
        >
          <Bell size={16} />
        </button>

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
            className="text-neutral-500 hover:text-neutral-300 transition-colors"
            title="Logout"
            data-testid="nav-logout"
          >
            <LogOut size={16} />
          </button>
        )}
      </div>
    </header>
  )
}
