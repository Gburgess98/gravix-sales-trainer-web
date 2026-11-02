import {
  LayoutDashboard,
  Phone,
  Building2,
  Users,
  Users2,
  ClipboardList,
  ClipboardCheck,
  Swords,
  Brain,
  BarChart2,
  Briefcase,
  Settings,
  Sparkles,
  Handshake,
  ShieldCheck,
  UserCircle,
  Upload,
  type LucideIcon,
} from 'lucide-react'

export type NavRole = 'all' | 'manager' | 'admin' | 'partneradmin' | 'superadmin'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  roles?: NavRole[]
  /**
   * Staging redesign — same destination, role-appropriate wording/priority. Applied only
   * when the viewer is a manager; visibility is still decided by `roles` alone.
   * `hidden` is only for an item whose destination a manager already reaches under another label
   * (Command Centre = manager Overview) — never to remove a destination.
   */
  manager?: { label?: string; secondary?: boolean; hidden?: boolean }
  /**
   * Day 45 — lower-frequency destination: listed under the labelled "More" group
   * instead of its section. Visibility is still decided by `roles` alone, so
   * marking an item secondary never changes who can see it.
   */
  secondary?: boolean
}

export interface NavSection {
  title: string
  items: NavItem[]
  roles?: NavRole[]
}

// Paths where the full app shell (sidebar + topbar) should render.
// Everything else (login, auth, home) uses the legacy header.
export const SHELL_PATHS = [
  '/dashboard',
  '/call-library',
  '/calls',
  '/crm',
  '/assignments',
  '/admin',
  '/sparring',
  '/reps',
  // Day 231 — '/rewards' removed: the legacy arcade page is now a server
  // redirect to /dashboard (same pattern as '/review' on Day 185).
  '/upload',
  '/whisperer',
  '/coaching',
  '/settings',
  '/team',
  // Day 225 — Intelligence workspace (Context Engine + Scorecard Studio).
  '/intelligence',
]

export function isShellPath(pathname: string): boolean {
  return SHELL_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  )
}

export const navigation: NavSection[] = [
  // Staging redesign — five labelled destinations per role. Rep: Home, Calls, Practice,
  // Coaching. Manager: Overview, Team, Reviews, Assignments, Insights. Same hrefs and
  // role gates as before; only wording and primary/"More" placement differ by role.
  // (Rep "Progress" waits for an approved route.)
  {
    title: 'Workspace',
    items: [
      // Manager Overview is the Command Centre's Overview tab (team health, reps needing attention,
      // calls to review, open coaching). The rep dashboard stays reachable as "My Dashboard" under More.
      { label: 'Overview', href: '/coaching', icon: LayoutDashboard, roles: ['manager'] },
      { label: 'Home', href: '/dashboard', icon: LayoutDashboard, manager: { label: 'My Dashboard', secondary: true } },
      { label: 'Calls', href: '/call-library', icon: Phone, manager: { secondary: true } },
      // Day 178 — deep-link the sparring tab so Calls and Practice are distinct destinations.
      { label: 'Practice', href: '/call-library?tab=sparring', icon: Swords, manager: { secondary: true } },
      // Day 214 — "Team" is people/team management (/team, read-only MVP).
      { label: 'Team', href: '/team', icon: Users2, roles: ['manager'] },
      // Review queue lives as a tab of the Command Centre; deep-linked (Day 165).
      { label: 'Reviews', href: '/coaching?tab=review', icon: ClipboardCheck, roles: ['manager'] },
      // Manager "Assignments" is the team view (Command Centre assignments tab); /assignments is the
      // viewer's OWN queue, so it stays reachable for managers as "My Assignments" under More.
      { label: 'Assignments', href: '/coaching?tab=assignments', icon: ClipboardList, roles: ['manager'] },
      { label: 'Coaching', href: '/assignments', icon: ClipboardList, manager: { label: 'My Assignments', secondary: true } },
      { label: 'Insights', href: '/crm/analytics', icon: BarChart2, roles: ['manager'] },
      // Lower-frequency destinations, listed under the labelled "More" group.
      { label: 'Accounts', href: '/crm/accounts', icon: Building2, secondary: true },
      { label: 'Contacts', href: '/crm/manager/contacts', icon: Users, roles: ['manager'], secondary: true },
      { label: 'Manager Centre', href: '/crm/manager', icon: Briefcase, roles: ['manager'], secondary: true },
      { label: 'Command Centre', href: '/coaching', icon: Brain, secondary: true, manager: { hidden: true } },
      // Day 225 — Intelligence = "teach" (what Gravix knows about how you sell); Insights = "observe".
      { label: 'Intelligence', href: '/intelligence', icon: Sparkles, roles: ['manager'], secondary: true },
      { label: 'Settings', href: '/admin/settings', icon: Settings, roles: ['manager'], secondary: true },
    ],
  },
  {
    // Day 161 — Upload Call stays one click away for everyone; it is a shared utility, not a fifth destination.
    title: 'Utilities',
    items: [{ label: 'Upload Call', href: '/upload', icon: Upload }],
  },
  {
    title: 'Account',
    items: [
      { label: 'My Profile', href: '/settings/profile', icon: UserCircle, secondary: true },
    ],
  },
  {
    title: 'Control Plane',
    roles: ['partneradmin'],
    items: [
      { label: 'Partners',  href: '/admin/partners',  icon: Handshake,   roles: ['superadmin'], secondary: true },
      { label: 'Companies', href: '/admin/companies', icon: Building2,    roles: ['partneradmin'], secondary: true },
      { label: 'Users',     href: '/admin/users',     icon: ShieldCheck,  roles: ['partneradmin'], secondary: true },
    ],
  },
]
