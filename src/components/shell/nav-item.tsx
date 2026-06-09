'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { clsx } from 'clsx'
import type { NavItem as NavItemType } from '@/config/navigation'

interface NavItemProps {
  item: NavItemType
  collapsed: boolean
  userTier?: string
}

export function NavItem({ item, collapsed }: NavItemProps) {
  const pathname = usePathname()

  const isActive =
    item.href === '/dashboard'
      ? pathname === '/dashboard'
      : pathname === item.href || pathname.startsWith(item.href + '/')

  const Icon = item.icon

  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={clsx(
        'group relative flex items-center gap-2.5 rounded-md py-1.5 text-sm font-medium transition-colors',
        isActive
          ? 'bg-neutral-800/80 text-white'
          : 'text-neutral-400 hover:bg-neutral-800/40 hover:text-neutral-200',
        collapsed ? 'justify-center px-2' : 'px-3',
      )}
    >
      {/* Active accent bar */}
      {isActive && !collapsed && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-emerald-400" />
      )}
      <Icon
        size={15}
        className={clsx(
          'shrink-0 transition-colors',
          isActive ? 'text-emerald-400' : 'text-neutral-500 group-hover:text-neutral-400',
        )}
      />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  )
}
