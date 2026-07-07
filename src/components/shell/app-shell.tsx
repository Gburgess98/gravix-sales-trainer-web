'use client'

import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'
import { getAdminConfig, proxyFetch } from '@/lib/api'
import { getImpersonationState, clearImpersonationState } from '@/lib/impersonation'
import type { ImpersonationState } from '@/lib/impersonation'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isManager, setIsManager] = useState(false)
  const [userTier, setUserTier] = useState<string | undefined>(undefined)
  const [impersonation, setImpersonation] = useState<ImpersonationState | null>(null)

  // Sync impersonation state on mount
  useEffect(() => {
    setImpersonation(getImpersonationState())
  }, [])

  async function handleExitImpersonation() {
    const state = getImpersonationState()
    try {
      await proxyFetch('/v1/admin/super/stop-impersonation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetUserId: state?.targetUserId ?? null }),
      })
    } catch { /* always clear */ }
    clearImpersonationState()
    setImpersonation(null)
    window.location.href = '/admin/users'
  }

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

  // Fetch user tier for partner/super-admin nav visibility
  useEffect(() => {
    proxyFetch('/v1/reps/me', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        const tier = d?.tier ?? d?.rep?.tier ?? d?.me?.tier
        if (d?.ok && tier) setUserTier(tier)
      })
      .catch(() => {})
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-950 text-neutral-100">
      <Sidebar
        collapsed={collapsed}
        onCollapse={handleCollapse}
        isManager={isManager}
        userTier={userTier}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* Main column */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <Topbar onMobileMenuOpen={() => setMobileOpen(true)} />

        {/* Impersonation banner — shown globally when a SuperAdmin is acting as another user */}
        {impersonation && (
          <div className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-950/50 px-4 py-2">
            <div className="flex items-center gap-2 text-sm text-amber-200">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span>
                Impersonating{' '}
                <span className="font-semibold text-amber-100">
                  {impersonation.targetName ?? impersonation.targetUserId.slice(0, 8)}
                </span>
                {impersonation.targetTier && (
                  <span className="ml-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                    {impersonation.targetTier}
                  </span>
                )}
              </span>
            </div>
            <button
              type="button"
              onClick={handleExitImpersonation}
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200 hover:bg-amber-500/20 transition-colors"
            >
              Exit Impersonation
            </button>
          </div>
        )}

        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}
