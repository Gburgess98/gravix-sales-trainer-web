'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { clsx } from 'clsx'
import type { NavItem as NavItemType } from '@/config/navigation'
import { navigation } from '@/config/navigation'
import { collectNavHrefs, isNavItemActive } from '@/config/nav-model'

const NAV_HREFS = collectNavHrefs(navigation)

interface NavItemProps {
  item: NavItemType
}

// Day 45 — always labelled. The icon-only rail was removed: every destination
// shows its text, with a clear active state (background + bar + aria-current).
export function NavItem({ item }: NavItemProps) {
  const pathname = usePathname() ?? ''
  const searchParams = useSearchParams()
  const isActive = isNavItemActive(item.href, pathname, searchParams, NAV_HREFS)
  const Icon = item.icon

  return (
    <Link
      href={item.href}
      aria-current={isActive ? 'page' : undefined}
      className={clsx(
        'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/70',
        isActive
          ? 'bg-indigo-500/10 text-white'
          : 'text-neutral-400 hover:bg-neutral-800/40 hover:text-neutral-200',
      )}
    >
      {isActive && (
        <span aria-hidden className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-indigo-400" />
      )}
      <Icon
        size={16}
        aria-hidden
        className={clsx(
          'shrink-0 transition-colors',
          isActive ? 'text-brand-300' : 'text-neutral-500 group-hover:text-neutral-300',
        )}
      />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}
