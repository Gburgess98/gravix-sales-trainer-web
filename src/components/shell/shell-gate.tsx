'use client'

import { usePathname } from 'next/navigation'
import { AppShell } from './app-shell'
import HeaderClient from '@/components/HeaderClient'
import { isShellPath } from '@/config/navigation'

interface ShellGateProps {
  children: React.ReactNode
}

export function ShellGate({ children }: ShellGateProps) {
  const pathname = usePathname()

  if (isShellPath(pathname)) {
    return <AppShell>{children}</AppShell>
  }

  // Legacy layout: simple header + constrained container
  return (
    <>
      <HeaderClient />
      <div className="max-w-5xl mx-auto px-4">{children}</div>
    </>
  )
}
