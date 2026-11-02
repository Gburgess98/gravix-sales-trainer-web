// Day 45 — pure navigation model (no React, no Next, no icons at runtime).
//
// The sidebar used to inline its role check; it now builds from this module so the
// grouping can be tested without a browser. The role predicate below is the exact
// predicate the sidebar has always used (moved verbatim) — Day 45 changes how items
// are GROUPED (primary vs "More"), never who can SEE them.

import type { NavItem, NavRole, NavSection } from './navigation'

export function hasAccess(
  roles: NavRole[] | undefined,
  isManager: boolean,
  userTier?: string,
): boolean {
  if (!roles || roles.length === 0) return true
  if (roles.includes('all')) return true
  if (roles.includes('manager') && isManager) return true
  if (roles.includes('partneradmin') && (userTier === 'PartnerAdmin' || userTier === 'SuperAdmin')) return true
  if (roles.includes('superadmin') && userTier === 'SuperAdmin') return true
  return false
}

export interface NavModel {
  /** Sections with only their visible, non-secondary items (empty sections dropped). */
  sections: NavSection[]
  /** Visible secondary items, in original navigation order, shown under "More". */
  more: NavItem[]
}

/** Apply the manager wording/priority override (visibility is untouched). */
export function resolveNavItem(item: NavItem, isManager: boolean): NavItem {
  if (!isManager || !item.manager) return item
  return {
    ...item,
    label: item.manager.label ?? item.label,
    secondary: item.manager.secondary ?? item.secondary,
  }
}

export function buildNavModel(
  navigation: NavSection[],
  isManager: boolean,
  userTier?: string,
): NavModel {
  const sections: NavSection[] = []
  const more: NavItem[] = []
  for (const section of navigation) {
    if (!hasAccess(section.roles, isManager, userTier)) continue
    const visible = section.items
      .filter((item) => hasAccess(item.roles, isManager, userTier))
      .map((item) => resolveNavItem(item, isManager))
    const primary = visible.filter((item) => !item.secondary)
    more.push(...visible.filter((item) => item.secondary))
    if (primary.length > 0) sections.push({ ...section, items: primary })
  }
  return { sections, more }
}

export type NavSearch = string | URLSearchParams | { toString(): string } | null | undefined

/** Every destination href in a navigation tree (used so a plain item can yield to a sibling tab link). */
export function collectNavHrefs(navigation: NavSection[]): string[] {
  return navigation.flatMap((section) => section.items.map((item) => item.href))
}

function parseSearch(search: NavSearch): URLSearchParams {
  return new URLSearchParams(typeof search === 'string' ? search : search ? search.toString() : '')
}

function queryMatches(query: string, current: URLSearchParams): boolean {
  for (const [key, value] of new URLSearchParams(query)) {
    if (current.get(key) !== value) return false
  }
  return true
}

/**
 * Query-aware active state (Day 45 fix). Path matching is unchanged from the original
 * (exact, `/dashboard` exact-only, otherwise prefix on a segment boundary). On top of that:
 *  - an href WITH a query (the Sparring deep-link) is active only when every one of its
 *    params equals the current URL's param;
 *  - an href WITHOUT a query (Calls) yields when a sibling href on the same path selects the
 *    current query — so `/call-library?tab=sparring` activates Sparring only, while
 *    `/call-library` and `/call-library?tab=upload` still activate Calls only.
 * `navHrefs` is the full list of nav hrefs (see collectNavHrefs).
 */
export function isNavItemActive(
  href: string,
  pathname: string,
  search?: NavSearch,
  navHrefs: string[] = [],
): boolean {
  const [path, query = ''] = href.split('?')
  const pathMatches =
    path === '/dashboard'
      ? pathname === path
      : pathname === path || pathname.startsWith(path + '/')
  if (!pathMatches) return false

  const current = parseSearch(search)
  if (query) return queryMatches(query, current)

  return !navHrefs.some((other) => {
    const [otherPath, otherQuery = ''] = other.split('?')
    return otherQuery !== '' && otherPath === path && queryMatches(otherQuery, current)
  })
}
