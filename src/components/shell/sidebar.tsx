'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { ChevronDown, X, Zap } from 'lucide-react'
import { clsx } from 'clsx'
import { NavSection } from './nav-section'
import { NavItem } from './nav-item'
import { navigation } from '@/config/navigation'
import { buildNavModel, collectNavHrefs, isNavItemActive } from '@/config/nav-model'

const NAV_HREFS = collectNavHrefs(navigation)

interface SidebarProps {
  isManager: boolean
  userTier?: string
  // Mobile drawer state
  mobileOpen: boolean
  onMobileClose: () => void
}

// Day 45 — one calm, always-labelled navigation. Highest-frequency destinations
// are listed under their sections; lower-frequency ones live in a labelled "More"
// group (never behind unexplained icons). Role visibility is unchanged — it comes
// from the same predicate via buildNavModel.
export function Sidebar({ isManager, userTier, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname() ?? ''
  const searchParams = useSearchParams()
  const model = useMemo(
    () => buildNavModel(navigation, isManager, userTier),
    [isManager, userTier],
  )
  const moreActive = model.more.some((item) => isNavItemActive(item.href, pathname, searchParams, NAV_HREFS))
  const [moreOpen, setMoreOpen] = useState(false)

  // A destination inside "More" is never hidden while you are on it.
  useEffect(() => {
    if (moreActive) setMoreOpen(true)
  }, [moreActive])

  // Close the drawer after navigating, and on Escape.
  useEffect(() => {
    onMobileClose()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onMobileClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen, onMobileClose])

  return (
    <>
      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          aria-hidden
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar panel. Below lg it is an off-canvas drawer: `invisible` removes it
          from layout paint, focus order and assistive tech while closed. */}
      <aside
        aria-label="Primary"
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-neutral-800/60 bg-neutral-950/70 backdrop-blur-xl transition-[transform,visibility] duration-200 ease-in-out motion-reduce:transition-none',
          'lg:visible lg:relative lg:w-60 lg:translate-x-0',
          mobileOpen ? 'visible translate-x-0' : 'invisible -translate-x-full',
        )}
      >
        {/* Brand */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-neutral-800/80 px-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-md text-white hover:text-neutral-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/70"
          >
            <Zap size={16} aria-hidden className="text-indigo-400" />
            <span className="text-sm font-semibold tracking-tight">Gravix</span>
          </Link>
          <button
            type="button"
            onClick={onMobileClose}
            className="lg:hidden rounded-md p-1 text-neutral-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/70"
            aria-label="Close menu"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        {/* Nav */}
        <nav aria-label="Main" className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-1">
          {model.sections.map((section) => (
            <NavSection key={section.title} section={section} />
          ))}

          {model.more.length > 0 && (
            <div className="mt-5 border-t border-neutral-800/70 pt-3">
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
                aria-controls="sidebar-more"
                className="flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-500 hover:text-neutral-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/70"
              >
                <span>More</span>
                <ChevronDown
                  size={14}
                  aria-hidden
                  className={clsx('transition-transform motion-reduce:transition-none', moreOpen && 'rotate-180')}
                />
              </button>
              {moreOpen && (
                <div id="sidebar-more" className="mt-1 space-y-0.5">
                  {model.more.map((item) => (
                    <NavItem key={item.href + item.label} item={item} />
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>
      </aside>
    </>
  )
}
