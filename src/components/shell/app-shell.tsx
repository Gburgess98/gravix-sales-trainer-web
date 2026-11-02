'use client'

import { Suspense, useState, useEffect, useCallback } from 'react'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'
import { getAdminConfig, proxyFetch } from '@/lib/api'
import { getImpersonationState, clearImpersonationState } from '@/lib/impersonation'
import type { ImpersonationState } from '@/lib/impersonation'

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
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

  const closeMobile = useCallback(() => setMobileOpen(false), [])

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
    <div className="flex h-[calc(100dvh-var(--staging-banner-h,0px))] overflow-hidden ds-app-bg text-neutral-100">
      {/* WCAG 2.4.1 — first focusable element; jumps past the sidebar to the page content. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-neutral-100 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-neutral-950 focus:outline-none focus:ring-2 focus:ring-brand-400"
      >
        Skip to content
      </a>
      {/* useSearchParams (query-aware active nav) needs a Suspense boundary for static pages. */}
      <Suspense fallback={null}>
        <Sidebar
          isManager={isManager}
          userTier={userTier}
          mobileOpen={mobileOpen}
          onMobileClose={closeMobile}
        />
      </Suspense>

      {/* Main column */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <Suspense fallback={null}>
          <Topbar onMobileMenuOpen={() => setMobileOpen(true)} isManager={isManager} />
        </Suspense>

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

        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto overflow-x-hidden focus:outline-none">
          {children}
        </main>
      </div>
    </div>
  )
}
