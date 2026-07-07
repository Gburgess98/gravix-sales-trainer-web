'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Zap } from 'lucide-react'
import { clsx } from 'clsx'
import { NavSection } from './nav-section'
import { navigation } from '@/config/navigation'

interface SidebarProps {
  collapsed: boolean
  onCollapse: (v: boolean) => void
  isManager: boolean
  userTier?: string
  // Mobile drawer state
  mobileOpen: boolean
  onMobileClose: () => void
}

// How long the pointer must rest over the sidebar before it expands (ms)
const HOVER_DELAY_MS = 175

export function Sidebar({
  collapsed,
  onCollapse,
  isManager,
  userTier,
  mobileOpen,
  onMobileClose,
}: SidebarProps) {
  const [hoverExpanded, setHoverExpanded] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clean up any pending timer on unmount
  useEffect(() => {
    return () => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current)
    }
  }, [])

  // The visual state used for layout/content decisions.
  // True only when pinned-collapsed AND not temporarily hover-expanded.
  const effectiveCollapsed = collapsed && !hoverExpanded

  function handleMouseEnter() {
    // Nothing to do when already pinned open
    if (!collapsed) return
    hoverTimer.current = setTimeout(() => setHoverExpanded(true), HOVER_DELAY_MS)
  }

  function handleMouseLeave() {
    if (hoverTimer.current) {
      clearTimeout(hoverTimer.current)
      hoverTimer.current = null
    }
    setHoverExpanded(false)
  }

  return (
    <>
      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-neutral-800/80 bg-neutral-950 transition-all duration-200 ease-in-out',
          'lg:relative lg:translate-x-0',
          effectiveCollapsed ? 'lg:w-[56px]' : 'lg:w-[220px]',
          mobileOpen ? 'translate-x-0 w-64' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Logo / brand */}
        <div
          className={clsx(
            'flex h-12 shrink-0 items-center border-b border-neutral-800/80',
            effectiveCollapsed ? 'justify-center px-2' : 'px-4',
          )}
        >
          {effectiveCollapsed ? (
            <Zap size={16} className="text-indigo-400" />
          ) : (
            <Link
              href="/dashboard"
              className="flex items-center gap-2 text-white hover:text-neutral-200 transition-colors"
            >
              <Zap size={14} className="text-indigo-400" />
              <span className="text-sm font-semibold tracking-tight">Gravix</span>
            </Link>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-1.5 py-1">
          {navigation.map((section) => (
            <NavSection
              key={section.title}
              section={section}
              collapsed={effectiveCollapsed}
              isManager={isManager}
              userTier={userTier}
            />
          ))}
        </nav>

        {/* Collapse toggle (desktop only) — reads/writes the real pinned state */}
        <div className="hidden lg:flex shrink-0 items-center border-t border-neutral-800/80 p-1.5">
          <button
            type="button"
            onClick={() => onCollapse(!collapsed)}
            className="flex w-full items-center justify-center rounded-md p-1.5 text-neutral-600 hover:bg-neutral-800/60 hover:text-neutral-400 transition-colors"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>
      </aside>
    </>
  )
}
