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
  Settings,
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
  '/review',
  '/reps',
  '/rewards',
  '/upload',
  '/whisperer',
  '/coaching',
  '/settings',
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
      { label: 'Team', href: '/crm/manager', icon: Users2, roles: ['manager'] },
    ],
  },
  {
    title: 'Coaching',
    items: [
      { label: 'Assignments', href: '/assignments', icon: ClipboardList },
      // Sparring sessions live in the Call Library (sparring tab)
      { label: 'Sparring', href: '/call-library', icon: Swords },
      { label: 'Command Centre', href: '/coaching', icon: Brain },
    ],
  },
  {
    title: 'Admin',
    roles: ['manager'],
    items: [
      { label: 'Analytics', href: '/crm/analytics', icon: BarChart2, roles: ['manager'] },
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
