'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { proxyFetch } from '@/lib/api'
import { LoadingText } from '@/components/ui/loading-skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { PageContainer } from '@/components/layout/page-container'
import { PageHeader } from '@/components/layout/page-header'
import { setImpersonationState, clearImpersonationState, getImpersonationState } from '@/lib/impersonation'

type UserRow = {
  id: string
  name: string | null
  tier: string | null
  company_id: string | null
  company_name: string | null
  partner_name: string | null
  created_at: string | null
}

const TIER_STYLE: Record<string, string> = {
  SuperAdmin:    'border-brand-400/40 bg-brand-500/15 text-brand-200',
  PartnerAdmin:  'border-brand-500/30 bg-brand-500/10 text-brand-300',
  Manager:       'border-accent-500/30 bg-accent-500/10 text-accent-300',
  Owner:         'border-neutral-600 bg-neutral-800/60 text-neutral-200',
  SalesRep:      'border-neutral-700 bg-neutral-900 text-neutral-400',
}

function TierBadge({ tier }: { tier: string | null }) {
  const t = tier || 'SalesRep'
  const cls = TIER_STYLE[t] ?? TIER_STYLE.SalesRep
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide font-medium ${cls}`}>
      {t}
    </span>
  )
}

function fmtDate(v: string | null) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function UsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [tierFilter, setTierFilter] = useState('all')
  const [myTier, setMyTier] = useState<string | null>(null)
  const [impersonating, setImpersonating] = useState<string | null>(
    () => getImpersonationState()?.targetUserId ?? null
  )
  const [impersonateLoading, setImpersonateLoading] = useState<string | null>(null)

  // Fetch own tier to conditionally show Become User button
  useEffect(() => {
    proxyFetch('/v1/reps/me', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        const tier = d?.tier ?? d?.rep?.tier ?? d?.me?.tier ?? null
        if (d?.ok) setMyTier(tier)
      })
      .catch(() => {})
  }, [])

  async function handleBecomeUser(user: UserRow) {
    if (impersonateLoading) return
    setImpersonateLoading(user.id)
    try {
      const r = await proxyFetch('/v1/admin/super/impersonate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetUserId: user.id }),
      })
      const d = await r.json()
      if (!r.ok || !d?.ok) throw new Error(d?.error || 'Impersonation failed')
      setImpersonationState({
        targetUserId: user.id,
        targetName:   user.name,
        targetTier:   user.tier,
        startedAt:    new Date().toISOString(),
      })
      setImpersonating(user.id)
      // Reload to apply impersonation context across the app
      window.location.href = '/dashboard'
    } catch (e: any) {
      alert(e?.message || 'Failed to start impersonation')
    } finally {
      setImpersonateLoading(null)
    }
  }

  async function handleStopImpersonation() {
    const state = getImpersonationState()
    try {
      await proxyFetch('/v1/admin/super/stop-impersonation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetUserId: state?.targetUserId ?? null }),
      })
    } catch { /* ignore — always clear local state */ }
    clearImpersonationState()
    setImpersonating(null)
    window.location.reload()
  }

  useEffect(() => {
    proxyFetch('/v1/admin/partner/users', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (!d?.ok) throw new Error(d?.error || 'Failed to load users')
        setUsers(d.users ?? [])
      })
      .catch((e: any) => setError(e?.message || 'Failed to load users'))
      .finally(() => setLoading(false))
  }, [])

  const tiers = useMemo(() => ['all', ...Array.from(new Set(users.map(u => u.tier || 'SalesRep').sort()))], [users])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter(u => {
      if (tierFilter !== 'all' && (u.tier || 'SalesRep') !== tierFilter) return false
      if (q) {
        return (u.name ?? '').toLowerCase().includes(q) ||
               (u.company_name ?? '').toLowerCase().includes(q) ||
               (u.partner_name ?? '').toLowerCase().includes(q)
      }
      return true
    })
  }, [users, search, tierFilter])

  return (
    <PageContainer>
      {/* Day 235 — shell adoption + explicit internal framing. This is the
          partner/superadmin control plane (impersonation lives here); it is
          not a manager demo surface and its nav entry is partneradmin-only. */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
          Control Plane · Internal admin
        </p>
        <PageHeader
          title="Users"
          subtitle="Reps and managers visible to your partner scope. Internal administration — not part of the manager workspace."
        />
      </div>

      {loading && <LoadingText text="Loading users…" />}

      {error && !loading && (
        <div className="rounded-xl border border-danger-500/30 bg-danger-500/5 px-4 py-4 text-sm text-danger-300">
          {error === 'forbidden_not_partner_admin'
            ? 'Access denied — PartnerAdmin or SuperAdmin required.'
            : error === 'missing_user'
              ? 'Users could not be loaded for this account. Sign in with an admin account and retry.'
              : error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Search + filters */}
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, company, partner…"
              className="w-full max-w-sm rounded-xl border border-neutral-800 bg-black/40 px-4 py-2 text-sm text-white outline-none focus:border-brand-500/50 placeholder:text-neutral-600"
            />
            <div className="flex flex-wrap gap-2">
              {tiers.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTierFilter(t)}
                  className={`rounded-xl border px-3 py-1.5 text-xs transition-all ${
                    tierFilter === t
                      ? 'border-brand-500/30 bg-brand-500/10 text-brand-200'
                      : 'border-neutral-800 bg-black/30 text-neutral-400 hover:border-neutral-700'
                  }`}
                >
                  {t === 'all' ? 'All' : t}
                </button>
              ))}
            </div>
            <span className="ml-auto text-xs text-neutral-500">{filtered.length} users</span>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              message={search ? `No users matching "${search}"` : 'No users found.'}
              sub={search ? 'Try a different search term.' : 'No users are visible within your partner scope.'}
              action={search ? { label: 'Clear search', onClick: () => setSearch('') } : undefined}
            />
          ) : (
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-800">
                      <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Name</th>
                      <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Tier</th>
                      <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Partner</th>
                      <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Company</th>
                      <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Joined</th>
                      {myTier === 'SuperAdmin' && (
                        <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/50">
                    {filtered.map(u => (
                      <tr
                        key={u.id}
                        onClick={() => router.push(`/admin/users/${u.id}`)}
                        className="hover:bg-neutral-900/30 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-white">{u.name || '—'}</div>
                          <div className="text-[10px] text-neutral-600 mt-0.5">{u.id.slice(0, 8)}…</div>
                        </td>
                        <td className="px-4 py-3"><TierBadge tier={u.tier} /></td>
                        <td className="px-4 py-3">
                          {u.partner_name
                            ? <span className="rounded-full border border-neutral-700 bg-neutral-800/60 px-2 py-0.5 text-[10px] text-neutral-300">{u.partner_name}</span>
                            : <span className="text-sm text-neutral-600">—</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-sm text-neutral-300">{u.company_name || '—'}</td>
                        <td className="px-4 py-3 text-sm text-neutral-400">{fmtDate(u.created_at)}</td>
                        {myTier === 'SuperAdmin' && (
                          <td className="px-4 py-3">
                            {impersonating === u.id ? (
                              <span className="rounded-full border border-warning-500/40 bg-warning-500/10 px-2 py-1 text-[10px] text-warning-300">
                                Active
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleBecomeUser(u)}
                                disabled={!!impersonateLoading}
                                className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-300 hover:border-brand-500/40 hover:bg-brand-500/10 hover:text-brand-300 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {impersonateLoading === u.id ? 'Starting…' : 'Become User'}
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-neutral-800/60 px-4 py-2 text-[10px] text-neutral-600 flex items-center justify-between">
                <span>{filtered.length} of {users.length} users</span>
                {impersonating && (
                  <button
                    type="button"
                    onClick={handleStopImpersonation}
                    className="text-[10px] text-warning-300 hover:text-warning-200 underline"
                  >
                    Exit impersonation
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </PageContainer>
  )
}
