import { NavItem } from './nav-item'
import type { NavSection as NavSectionType } from '@/config/navigation'

interface NavSectionProps {
  section: NavSectionType
}

// Day 45 — receives an already-filtered section from buildNavModel (role
// visibility lives in config/nav-model.ts, unchanged from the previous inline check).
export function NavSection({ section }: NavSectionProps) {
  if (section.items.length === 0) return null

  return (
    <div className="space-y-0.5">
      <div className="px-3 pb-1.5 pt-5 first:pt-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-500">
          {section.title}
        </span>
      </div>
      {section.items.map((item) => (
        <NavItem key={item.href + item.label} item={item} />
      ))}
    </div>
  )
}
