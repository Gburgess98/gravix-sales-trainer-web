'use client'

// Manager Centre (/crm/manager).
// Root cause of the hosted crash (digest 3227098399, "TypeError: fetch failed … ECONNREFUSED 127.0.0.1:3000"):
// this page used to be a server component that called its OWN /api/proxy over HTTP from the server, with a base URL
// taken from NEXT_PUBLIC_WEB_URL / NEXT_PUBLIC_APP_URL and a localhost:3000 default. Hosted has neither variable, so
// the fetch was refused, nothing caught it, and Next rendered the full "Application error". That call also only
// forwarded cookies while the app authenticates with a Bearer token, so it could never have identified the manager.
// The overview is now loaded in the browser through proxyFetch (which attaches auth) and a failure is a page-level
// notice with a retry; the page itself never throws.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { PageContainer } from '@/components/layout/page-container'
import { PageHeader } from '@/components/layout/page-header'
import { proxyFetch } from '@/lib/api'
import ManagerClient from './ManagerClient'

type Overview = { ok: boolean; items: unknown[]; mode?: string }

function ManagerCentre() {
  const [initial, setInitial] = useState<Overview | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const load = useCallback(async () => {
    setInitial(null)
    setFailed(false)
    try {
      const res = await proxyFetch('/v1/crm/manager/overview', { cache: 'no-store' })
      const json = await res.json().catch(() => null)
      if (res.ok && json?.ok && Array.isArray(json.items)) {
        setInitial(json as Overview)
        return
      }
    } catch {
      /* fall through to the notice */
    }
    // Degraded but usable: the controls below do not depend on the overview rows.
    setFailed(true)
    setInitial({ ok: true, items: [], mode: 'fallback' })
  }, [])

  useEffect(() => { void load() }, [load, attempt])

  return (
    <PageContainer>
      <PageHeader
        title="Team"
        subtitle="Team overview and auto-assign controls — preview a run first, then execute."
        actions={
          <>
            <Link href="/crm/manager/control-centre" className="rounded-lg bg-indigo-600/20 px-3 py-2 text-sm font-semibold text-indigo-200 hover:bg-indigo-600/30">
              Open Control Centre
            </Link>
            <Link href="/crm/overview" className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-800">
              Back to CRM Overview
            </Link>
          </>
        }
      />

      {failed && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning-500/20 bg-warning-500/5 px-4 py-3 text-sm text-warning-200">
          <span>Team overview could not be loaded right now. Core manager controls are still available below.</span>
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-800">
            Try again
          </button>
        </div>
      )}

      {initial === null ? (
        <div role="status" aria-label="Loading team overview" className="py-10 text-sm text-neutral-400">Loading team overview…</div>
      ) : (
        // key: a retry remounts the client so it picks up the fresh rows
        <ManagerClient key={attempt} initial={initial} />
      )}
    </PageContainer>
  )
}

export default function CrmManagerPage() {
  // Access is guarded by src/app/crm/manager/layout.tsx (RoleGate).
  return <ManagerCentre />
}
