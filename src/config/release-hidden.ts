// Routes withheld from this release (2026-11 production release). They stay in the codebase but are unreachable: no navigation
// entry or link points at them, and their segment layouts render a calm "not available" result instead of the page, so the page
// code never mounts and makes no requests. Remove an entry (and its layout.tsx) to re-enable a route.
export const RELEASE_HIDDEN_ROUTES = ['/admin/reps', '/crm/manager/nudges'] as const

export function isReleaseHidden(pathname: string): boolean {
  const p = pathname.split('?')[0].replace(/\/+$/, '') || '/'
  return RELEASE_HIDDEN_ROUTES.some((r) => p === r || p.startsWith(`${r}/`))
}
