'use client'

import { usePathname } from 'next/navigation'
import { AppShell } from './app-shell'
import AuthGate from '@/components/AuthGate'
import HeaderClient from '@/components/HeaderClient'
import { isShellPath } from '@/config/navigation'

interface ShellGateProps {
  children: React.ReactNode
}

export function ShellGate({ children }: ShellGateProps) {
  const pathname = usePathname()

  if (isShellPath(pathname)) {
    // Day 228 — logged-out visitors are sent to /login instead of seeing the
    // shell with every fetch quietly 401ing into "getting started" states.
    // /login and /auth/* are not shell paths, so no redirect loop is possible.
    return (
      <AuthGate>
        <AppShell>{children}</AppShell>
      </AuthGate>
    )
  }

  // Legacy layout: simple header + constrained container
  return (
    <>
      <HeaderClient />
      <div className="max-w-5xl mx-auto px-4">{children}</div>
    </>
  )
}
