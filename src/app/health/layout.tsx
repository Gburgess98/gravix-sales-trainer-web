import { RoleGate } from '@/components/auth/role-gate'

// Role guard for this whole segment (see components/auth/role-gate.tsx). Level: super.
// /health prints the raw proxy response and the API base URL, so it is a super-admin diagnostic.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <RoleGate level="super">{children}</RoleGate>
}
