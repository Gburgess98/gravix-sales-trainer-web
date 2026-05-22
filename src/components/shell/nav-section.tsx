import { clsx } from 'clsx'
import { NavItem } from './nav-item'
import type { NavSection as NavSectionType, NavRole } from '@/config/navigation'

interface NavSectionProps {
  section: NavSectionType
  collapsed: boolean
  isManager: boolean
}

function hasAccess(roles: NavRole[] | undefined, isManager: boolean): boolean {
  if (!roles || roles.length === 0) return true
  if (roles.includes('all')) return true
  if (roles.includes('manager') && isManager) return true
  return false
}

export function NavSection({ section, collapsed, isManager }: NavSectionProps) {
  if (!hasAccess(section.roles, isManager)) return null

  const visibleItems = section.items.filter((item) =>
    hasAccess(item.roles, isManager),
  )

  if (visibleItems.length === 0) return null

  return (
    <div className="space-y-0.5">
      {!collapsed && (
        <div className="px-3 pb-1 pt-5 first:pt-2">
          <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-neutral-600">
            {section.title}
          </span>
        </div>
      )}
      {collapsed && <div className="mx-2 border-t border-neutral-800/60 my-2" />}
      {visibleItems.map((item) => (
        <NavItem key={item.href + item.label} item={item} collapsed={collapsed} />
      ))}
    </div>
  )
}
