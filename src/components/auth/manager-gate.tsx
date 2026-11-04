'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { proxyFetch } from '@/lib/api'
import { dsButton } from '@/components/ds'

/* Manager-only destinations render nothing until the API confirms the role. `GET /v1/admin/config` is
   manager-only on the API: 200 = manager, 401/403 = not a manager (send them to their own queue), anything
   else = we could not tell (calm retry; never a redirect, never manager UI). `router.replace` keeps the
   redirect out of history so Back/Forward cannot loop. The API still enforces every manager request. */

type State = 'checking' | 'manager' | 'error'

export function ManagerGate({ children, redirectTo = '/assignments' }: { children: ReactNode; redirectTo?: string }) {
  const router = useRouter()
  const [state, setState] = useState<State>('checking')

  const check = useCallback(async () => {
    setState('checking')
    try {
      const res = await proxyFetch('/v1/admin/config', { cache: 'no-store' })
      if (res.ok) return setState('manager')
      if (res.status === 401 || res.status === 403) return router.replace(redirectTo)
      setState('error')
    } catch {
      setState('error')
    }
  }, [router, redirectTo])

  useEffect(() => { void check() }, [check])

  if (state === 'manager') return <>{children}</>
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
