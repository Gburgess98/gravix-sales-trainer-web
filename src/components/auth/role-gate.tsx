'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { proxyFetch } from '@/lib/api'
import { dsButton } from '@/components/ds'

/* One guard for every role-restricted destination. Used from segment `layout.tsx` files, so a page added to a
   guarded folder is protected by default.

   The API is the authority. Each level probes an endpoint that already answers 200 or 403 by role:
     manager  GET /v1/admin/config          (requireManager)
     partner  GET /v1/admin/partner/health  (requirePartnerAdmin)
     super    GET /v1/admin/super/health    (requireSuperAdmin)
   200 → render. 401/403 → `router.replace(redirectTo)` (not in history, so Back/Forward cannot loop; nothing role-specific
   renders and no role-specific request is made first). Anything else → a calm retry, never a redirect and never the page.
   This is UI hygiene (no restricted chrome, no raw errors); the API still enforces every request. */

export type RoleLevel = 'manager' | 'partner' | 'super'
export const ROLE_PROBES: Record<RoleLevel, string> = {
  manager: '/v1/admin/config',
  partner: '/v1/admin/partner/health',
  super: '/v1/admin/super/health',
}

type State = 'checking' | 'allowed' | 'error'

export function RoleGate({ level, children, redirectTo = '/assignments' }: { level: RoleLevel; children: ReactNode; redirectTo?: string }) {
  const router = useRouter()
  const [state, setState] = useState<State>('checking')
  const probe = ROLE_PROBES[level]

  const check = useCallback(async () => {
    setState('checking')
    try {
      const res = await proxyFetch(probe, { cache: 'no-store' })
      if (res.ok) return setState('allowed')
      if (res.status === 401 || res.status === 403) return router.replace(redirectTo)
      setState('error')
    } catch {
      setState('error')
    }
  }, [router, redirectTo, probe])

  useEffect(() => { void check() }, [check])

  if (state === 'allowed') return <>{children}</>
  if (state === 'error') {
    return (
      <div role="alert" className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm font-medium text-red-200">Couldn’t check your access</p>
        <p className="mt-1.5 text-sm text-[var(--ds-text-3)]">Nothing has changed. Try again in a moment.</p>
        <button type="button" onClick={() => void check()} className={`${dsButton('secondary', 'sm')} mt-5`}>Try again</button>
      </div>
    )
  }
  return <div role="status" aria-label="Checking access" className="mx-auto max-w-md px-4 py-16 text-center text-sm text-[var(--ds-text-3)]">Loading…</div>
}
