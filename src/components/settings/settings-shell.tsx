'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { dsField } from '@/components/ds'
import { SECTIONS, type SectionId } from '@/lib/settings-model'
import { ConfirmDialog } from './confirm-dialog'

/* Settings layout: section navigation on the left at desktop widths, a labelled native <select> below that.
   Each section is a real URL (?section=…), so deep links, refresh and Back/Forward all work; the page keeps the
   draft values of every section in one place, so moving between sections never discards an edit. */

const href = (id: SectionId) => `/admin/settings?section=${id}`

export function SettingsShell({ active, dirty, children }: { active: SectionId; dirty: Partial<Record<SectionId, boolean>>; children: ReactNode }) {
  const router = useRouter()
  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
      <nav aria-label="Settings sections" className="hidden lg:block">
        <ul className="space-y-0.5">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <Link
                href={href(s.id)}
                aria-current={s.id === active ? 'page' : undefined}
                className={`ds-focus flex items-center justify-between gap-2 rounded-[var(--ds-radius-control)] px-3 py-2 text-sm transition-colors ${s.id === active ? 'bg-white/[0.08] font-medium text-[var(--ds-text)]' : 'text-[var(--ds-text-2)] hover:bg-white/[0.05] hover:text-[var(--ds-text)]'}`}
              >
                <span className="truncate">{s.label}</span>
                {dirty[s.id] && <span aria-label="Unsaved changes" className="h-2 w-2 shrink-0 rounded-full bg-amber-300" />}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="lg:hidden">
        <label htmlFor="settings-section" className="text-xs text-[var(--ds-text-3)]">Settings section</label>
        <select
          id="settings-section"
          value={active}
          onChange={(e) => router.push(href(e.target.value as SectionId))}
          className={`${dsField} mt-1`}
        >
          {SECTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}{dirty[s.id] ? ' • unsaved' : ''}</option>)}
        </select>
      </div>

      <div className="min-w-0 space-y-6">{children}</div>
    </div>
  )
}

/* Warn before losing unsaved edits: tab close / refresh (beforeunload) and in-app links that leave the page.
   Switching Settings sections is not "leaving" (drafts are kept). Browser Back cannot be intercepted by the App Router. */
export function useUnsavedGuard(dirty: boolean) {
  const router = useRouter()
  const [pending, setPending] = useState<string | null>(null)

  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return
      const url = new URL(a.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname) return // another Settings section: drafts are kept
      e.preventDefault()
      e.stopPropagation()
      setPending(url.pathname + url.search + url.hash)
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [dirty])

  const dialog = (
    <ConfirmDialog
      open={pending !== null}
      title="Leave without saving?"
      confirmLabel="Leave"
      cancelLabel="Stay"
      onCancel={() => setPending(null)}
      onConfirm={() => { const to = pending; setPending(null); if (to) router.push(to) }}
    >
      <p>You have changes that haven’t been saved. If you leave now they will be lost.</p>
    </ConfirmDialog>
  )
  return { dialog }
}
