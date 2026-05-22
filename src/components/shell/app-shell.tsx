'use client'

import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'
import { getAdminConfig } from '@/lib/api'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isManager, setIsManager] = useState(false)

  // Restore sidebar collapsed state from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('gravix_sidebar_collapsed')
      if (saved === '1') setCollapsed(true)
    } catch {}
  }, [])

  const handleCollapse = useCallback((v: boolean) => {
    setCollapsed(v)
    try {
      localStorage.setItem('gravix_sidebar_collapsed', v ? '1' : '0')
    } catch {}
  }, [])

  // Lightweight manager check — does not gate rendering, only filters nav
  useEffect(() => {
    getAdminConfig()
      .then(() => setIsManager(true))
      .catch(() => {})
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-950 text-neutral-100">
      <Sidebar
        collapsed={collapsed}
        onCollapse={handleCollapse}
        isManager={isManager}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Main column */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <Topbar onMobileMenuOpen={() => setMobileOpen(true)} />

        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}
