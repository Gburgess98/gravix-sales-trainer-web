import {
  LayoutDashboard,
  Phone,
  Building2,
  Users,
  Users2,
  ClipboardList,
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
  {
    title: 'Workspace',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      // Day 161 — Upload Call promoted to the sidebar so managers never have to hunt for it.
      { label: 'Upload Call', href: '/upload', icon: Upload },
      { label: 'Calls', href: '/call-library', icon: Phone },
      { label: 'Accounts', href: '/crm/accounts', icon: Building2 },
      // Contacts: manager-only until a rep-facing contacts page exists
      { label: 'Contacts', href: '/crm/manager/contacts', icon: Users, roles: ['manager'] },
      // Day 214 — "Team" now means people/team management (/team, read-only MVP).
      // The coaching-workload workspace at /crm/manager keeps its own entry as
      // "Manager Centre" so neither destination is lost or duplicated.
      { label: 'Team', href: '/team', icon: Users2, roles: ['manager'] },
      { label: 'Manager Centre', href: '/crm/manager', icon: Briefcase, roles: ['manager'] },
    ],
  },
  {
    title: 'Coaching',
    items: [
      { label: 'Assignments', href: '/assignments', icon: ClipboardList },
      // Day 178 — deep-link the sparring tab so Sparring and Calls are distinct
      // destinations (Calls lands on Live Calls, Sparring lands on AI Sparring).
      { label: 'Sparring', href: '/call-library?tab=sparring', icon: Swords },
      { label: 'Command Centre', href: '/coaching', icon: Brain },
    ],
  },
  {
    title: 'Admin',
    roles: ['manager'],
    items: [
      { label: 'Analytics', href: '/crm/analytics', icon: BarChart2, roles: ['manager'] },
      // Day 225 — Intelligence workspace, per CONTEXT_ENGINE_ROUTE_PLAN.md §2.
      // Deliberately distinct from Analytics: /crm/analytics is "observe" (what
      // the team is doing), /intelligence is "teach" (what Gravix knows about
      // how you sell). Sparkles because Brain is Command Centre and BarChart2
      // is Analytics — no duplicate labels or icons.
      { label: 'Intelligence', href: '/intelligence', icon: Sparkles, roles: ['manager'] },
      { label: 'Settings', href: '/admin/settings', icon: Settings, roles: ['manager'] },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'My Profile', href: '/settings/profile', icon: UserCircle },
    ],
  },
  {
    title: 'Control Plane',
    roles: ['partneradmin'],
    items: [
      { label: 'Partners',  href: '/admin/partners',  icon: Handshake,   roles: ['superadmin'] },
      { label: 'Companies', href: '/admin/companies', icon: Building2,    roles: ['partneradmin'] },
      { label: 'Users',     href: '/admin/users',     icon: ShieldCheck,  roles: ['partneradmin'] },
    ],
  },
]
