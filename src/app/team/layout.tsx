import { RoleGate } from '@/components/auth/role-gate'

// Role guard for this whole segment (see components/auth/role-gate.tsx). Level: manager.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <RoleGate level="manager">{children}</RoleGate>
}
