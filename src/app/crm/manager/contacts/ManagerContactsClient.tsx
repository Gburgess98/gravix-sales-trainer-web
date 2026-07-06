'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { proxyFetch } from '@/lib/api'
import { useToast } from '@/components/Toast'
import { StatCard } from '@/components/ui/stat-card'
import { ScorePill } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingText } from '@/components/ui/loading-skeleton'
import { FilterBar, FilterOption } from '@/components/ui/filter-bar'
import { EntitySearch, type EntityHit } from '@/components/ui/entity-search'

// ── Thresholds (move to Admin Settings when configurable) ────────────────────
const NO_ACTIVITY_DAYS = 30

// ── Types ─────────────────────────────────────────────────────────────────────

type ContactFilter = 'all' | 'at_risk' | 'unassigned' | 'inactive'

type ContactRow = {
  id: string
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  company?: string | null
  phone?: string | null
  owner_id?: string | null
  owner_name?: string | null
  account_id?: string | null
  account_name?: string | null
  created_at?: string | null
  last_contacted_at?: string | null
  health?: {
    score?: number | null
    band?: string | null
    reasons?: string[]
    stats?: {
      open_actions?: number
      overdue_actions?: number
      last_contacted_days?: number | null
      has_notes?: boolean
      has_recent_call?: boolean
    }
  } | null
  action_counts?: { open?: number; overdue?: number; completed?: number } | null
}

type CreateForm = {
  first_name: string
  last_name: string
  email: string
  company: string
  phone: string
  owner_id: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CONTACT_FILTERS: FilterOption<ContactFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'at_risk', label: 'At Risk', variant: 'danger' },
  { value: 'unassigned', label: 'Unassigned', variant: 'warning' },
  { value: 'inactive', label: `No Activity ${NO_ACTIVITY_DAYS}d` },
]

const EMPTY_FORM: CreateForm = { first_name: '', last_name: '', email: '', company: '', phone: '', owner_id: '' }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtName(r: ContactRow): string {
  const a = String(r.first_name ?? '').trim()
  const b = String(r.last_name ?? '').trim()
  return `${a} ${b}`.trim() || '—'
}

function n(v: any): number {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

function fmtLastActivity(row: ContactRow): string {
  const days = n(row.health?.stats?.last_contacted_days)
  if (days === 0 && !row.last_contacted_at) return 'Never'
  if (days === 0) return 'Today'
  if (days === 1) return '1d ago'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.round(days / 30)}mo ago`
  return `${Math.round(days / 365)}y ago`
}

function healthDot(overdue: number, score: number): string {
  if (overdue > 0) return 'bg-red-500'
  if (score > 0 && score < 60) return 'bg-amber-400'
  return 'bg-neutral-700'
}

function bandCls(band?: string | null): string {
  const b = String(band ?? '').toLowerCase()
  if (b === 'good' || b === 'healthy') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
  if (b === 'watch') return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
  if (b === 'risk' || b === 'at_risk') return 'border-red-500/30 bg-red-500/10 text-red-300'
  return 'border-neutral-700 bg-neutral-900/60 text-neutral-400'
}

function bandLabel(band?: string | null): string {
  const b = String(band ?? '').toLowerCase()
  if (b === 'good' || b === 'healthy') return 'Good'
  if (b === 'watch') return 'Watch'
  if (b === 'risk' || b === 'at_risk') return 'At Risk'
  return band ? String(band) : '—'
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ManagerContactsClient() {
  const toast = useToast()

  const [contacts, setContacts] = useState<ContactRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<ContactFilter>('all')
  const [creatingForId, setCreatingForId] = useState<string | null>(null)
  const [actionMenuId, setActionMenuId] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_FORM)
  const [createSaving, setCreateSaving] = useState(false)
  const [createOwnerSelection, setCreateOwnerSelection] = useState<EntityHit | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActionMenuId(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const loadContacts = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await proxyFetch('/v1/crm/manager/contacts?limit=200', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok || data?.ok === false) throw new Error(data?.error || 'Failed to load contacts')
      const items: ContactRow[] = Array.isArray(data.items) ? data.items : []
      // Sort: overdue first, then lowest health score, then most days inactive
      items.sort((a, b) => {
        const ao = n(a.health?.stats?.overdue_actions ?? a.action_counts?.overdue)
        const bo = n(b.health?.stats?.overdue_actions ?? b.action_counts?.overdue)
        if (bo !== ao) return bo - ao
        const as_ = n(a.health?.score)
        const bs = n(b.health?.score)
        if (as_ !== bs) return as_ - bs
        return n(b.health?.stats?.last_contacted_days) - n(a.health?.stats?.last_contacted_days)
      })
      setContacts(items)
    } catch (e: any) {
      setLoadError(e?.message || 'Failed to load contacts')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadContacts() }, [loadContacts])

  // ── KPI derived data ─────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total = contacts.length
    const assigned = contacts.filter(c => c.owner_id).length
    const unassigned = total - assigned
    const inactive = contacts.filter(c => n(c.health?.stats?.last_contacted_days) >= NO_ACTIVITY_DAYS || (!c.last_contacted_at && !c.health?.stats?.last_contacted_days)).length
    return { total, assigned, unassigned, inactive }
  }, [contacts])

  // ── Filtered list ────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...contacts]

    // Text search
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(c =>
        fmtName(c).toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (c.company ?? '').toLowerCase().includes(q) ||
        (c.owner_name ?? '').toLowerCase().includes(q) ||
        (c.account_name ?? '').toLowerCase().includes(q)
      )
    }

    // Filter tab
    if (activeFilter === 'at_risk') {
      list = list.filter(c => {
        const band = String(c.health?.band ?? '').toLowerCase()
        const overdue = n(c.health?.stats?.overdue_actions ?? c.action_counts?.overdue)
        return band === 'risk' || band === 'at_risk' || overdue > 0 || n(c.health?.score) < 60
      })
    } else if (activeFilter === 'unassigned') {
      list = list.filter(c => !c.owner_id)
    } else if (activeFilter === 'inactive') {
      list = list.filter(c => n(c.health?.stats?.last_contacted_days) >= NO_ACTIVITY_DAYS || (!c.last_contacted_at && !c.health?.stats?.last_contacted_days))
    }

    return list
  }, [contacts, search, activeFilter])

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function createFollowUp(contactId: string) {
    setCreatingForId(contactId)
    try {
      const res = await proxyFetch('/v1/crm/actions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, type: 'follow_up', title: 'Follow up', meta: { source: 'manager_contacts' } }),
      })
      const data = await res.json()
      if (!res.ok || data?.ok === false) throw new Error(data?.error || 'Failed to create task')
      toast.success('Follow-up task created.')
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create task')
    } finally {
      setCreatingForId(null)
      setActionMenuId(null)
    }
  }

  async function handleCreateContact(e: React.FormEvent) {
    e.preventDefault()
    // TODO: wire up when backend POST /v1/crm/contacts is available
    setCreateSaving(true)
    try {
      await new Promise(r => setTimeout(r, 400)) // placeholder
      toast.info('Contact creation coming soon — backend endpoint not yet available.')
      setCreateOpen(false)
      setCreateForm(EMPTY_FORM)
      setCreateOwnerSelection(null)
    } finally {
      setCreateSaving(false)
    }
  }

  function updateForm(k: keyof CreateForm, v: string) {
    setCreateForm(prev => ({ ...prev, [k]: v }))
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="px-6 py-6 space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">CRM</p>
          <h1 className="mt-0.5 text-xl font-semibold text-white">Contacts</h1>
          <p className="mt-0.5 text-sm text-neutral-400">Pipeline triage — overdue actions, health, and ownership.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/crm/manager"
            className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 transition-colors"
          >
            ← Team
          </Link>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/20 transition-colors"
          >
            + New Contact
          </button>
          <button
            type="button"
            onClick={loadContacts}
            className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* ── KPI strip ── */}
      {!loading && !loadError && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Contacts" value={kpis.total} />
          <StatCard label="Assigned" value={kpis.assigned} variant="success" />
          <StatCard label="Unassigned" value={kpis.unassigned} variant={kpis.unassigned > 0 ? 'warning' : 'default'} />
          <StatCard label={`No Activity ${NO_ACTIVITY_DAYS}d`} value={kpis.inactive} variant={kpis.inactive > 0 ? 'danger' : 'default'} />
        </div>
      )}

      {/* ── Search + Filter ── */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, email, company, owner…"
          className="w-full max-w-sm rounded-xl border border-neutral-800 bg-black/40 px-4 py-2 text-sm text-white outline-none transition-all focus:border-cyan-500/40 placeholder:text-neutral-600"
        />
        <FilterBar
          options={CONTACT_FILTERS}
          value={activeFilter}
          onChange={setActiveFilter}
          count={loading ? undefined : filtered.length}
          countLabel="contacts"
        />
      </div>

      {/* ── Body ── */}
      {loading && <LoadingText text="Loading contacts…" />}

      {loadError && !loading && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-4 text-sm text-red-300">{loadError}</div>
      )}

      {!loading && !loadError && filtered.length === 0 && (
        <EmptyState
          message={search ? `No contacts matching "${search}"` : `No ${activeFilter !== 'all' ? activeFilter.replace('_', ' ') + ' ' : ''}contacts found.`}
          sub={search ? 'Try a different search term or clear the filter.' : activeFilter === 'at_risk' ? 'No contacts are currently flagged as at risk.' : activeFilter === 'unassigned' ? 'All contacts have been assigned an owner.' : undefined}
          action={search ? { label: 'Clear search', onClick: () => setSearch('') } : undefined}
        />
      )}

      {!loading && !loadError && filtered.length > 0 && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden" ref={menuRef}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-800">
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Contact</th>
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Company</th>
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Owner</th>
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Account</th>
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Last Activity</th>
                  <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Health</th>
                  <th className="px-4 py-3 text-right text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Overdue</th>
                  <th className="px-4 py-3 text-right text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Score</th>
                  <th className="px-4 py-3 text-right text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/50">
                {filtered.map(c => {
                  const overdue = n(c.health?.stats?.overdue_actions ?? c.action_counts?.overdue)
                  const open = n(c.health?.stats?.open_actions ?? c.action_counts?.open)
                  const score = n(c.health?.score)
                  const dot = healthDot(overdue, score)
                  const isMenuOpen = actionMenuId === c.id

                  return (
                    <tr key={c.id} className="hover:bg-neutral-900/30 transition-colors group">
                      {/* Name + Email */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${dot}`} />
                          <Link
                            href={`/crm/contacts/${encodeURIComponent(c.id)}`}
                            className="font-medium text-white hover:underline"
                          >
                            {fmtName(c)}
                          </Link>
                        </div>
                        {c.email && (
                          <div className="mt-0.5 text-[11px] text-neutral-500 pl-4">{c.email}</div>
                        )}
                      </td>

                      {/* Company */}
                      <td className="px-4 py-3 text-sm text-neutral-300">{c.company || '—'}</td>

                      {/* Owner */}
                      <td className="px-4 py-3">
                        {c.owner_name ? (
                          <span className="text-sm text-neutral-200">{c.owner_name}</span>
                        ) : (
                          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">
                            Unassigned
                          </span>
                        )}
                      </td>

                      {/* Account */}
                      <td className="px-4 py-3">
                        {c.account_id ? (
                          <Link
                            href={`/crm/accounts/${encodeURIComponent(c.account_id)}`}
                            className="text-sm text-cyan-400 hover:underline"
                          >
                            {c.account_name || c.account_id.slice(0, 8) + '…'}
                          </Link>
                        ) : (
                          <span className="text-sm text-neutral-600">—</span>
                        )}
                      </td>

                      {/* Last Activity */}
                      <td className="px-4 py-3">
                        <span className={`text-sm ${n(c.health?.stats?.last_contacted_days) >= NO_ACTIVITY_DAYS ? 'text-amber-400' : 'text-neutral-400'}`}>
                          {fmtLastActivity(c)}
                        </span>
                      </td>

                      {/* Health band */}
                      <td className="px-4 py-3">
                        {c.health?.band ? (
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${bandCls(c.health.band)}`}>
                            {bandLabel(c.health.band)}
                          </span>
                        ) : (
                          <span className="text-neutral-600 text-xs">—</span>
                        )}
                      </td>

                      {/* Overdue */}
                      <td className="px-4 py-3 text-right">
                        {overdue > 0 ? (
                          <span className="rounded-md bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-300">{overdue}</span>
                        ) : (
                          <span className="text-sm text-neutral-600">0</span>
                        )}
                      </td>

                      {/* Score */}
                      <td className="px-4 py-3 text-right">
                        <ScorePill score={score || null} />
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5 relative">
                          <Link
                            href={`/crm/contacts/${encodeURIComponent(c.id)}`}
                            className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800 transition-colors"
                          >
                            View
                          </Link>
                          <button
                            type="button"
                            disabled={creatingForId === c.id}
                            onClick={() => createFollowUp(c.id)}
                            className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-50 transition-colors"
                          >
                            {creatingForId === c.id ? '…' : 'Task'}
                          </button>
                          {/* "..." more menu */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setActionMenuId(isMenuOpen ? null : c.id)}
                              className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
                            >
                              ···
                            </button>
                            {isMenuOpen && (
                              <div className="absolute right-0 top-full mt-1 z-20 min-w-[160px] rounded-xl border border-neutral-700 bg-neutral-900 shadow-xl py-1">
                                <Link
                                  href={`/crm/contacts/${encodeURIComponent(c.id)}`}
                                  onClick={() => setActionMenuId(null)}
                                  className="flex items-center gap-2 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-800 transition-colors"
                                >
                                  View Contact
                                </Link>
                                <Link
                                  href={`/crm/contacts/${encodeURIComponent(c.id)}`}
                                  onClick={() => setActionMenuId(null)}
                                  className="flex items-center gap-2 px-3 py-2 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
                                >
                                  Assign Owner
                                </Link>
                                <Link
                                  href={`/crm/contacts/${encodeURIComponent(c.id)}`}
                                  onClick={() => setActionMenuId(null)}
                                  className="flex items-center gap-2 px-3 py-2 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
                                >
                                  Link Account
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => createFollowUp(c.id)}
                                  className="w-full text-left flex items-center gap-2 px-3 py-2 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
                                >
                                  Create Task
                                </button>
                                {c.email && (
                                  <a
                                    href={`mailto:${c.email}`}
                                    onClick={() => setActionMenuId(null)}
                                    className="flex items-center gap-2 px-3 py-2 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
                                  >
                                    Send Email
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-neutral-800/60 px-4 py-2 text-[10px] text-neutral-600">
            {filtered.length} of {contacts.length} contacts · Source: /v1/crm/manager/contacts
          </div>
        </div>
      )}

      {/* ── Create Contact Modal ── */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => { setCreateOpen(false); setCreateForm(EMPTY_FORM) }}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-white">New Contact</h2>
                <p className="text-xs text-neutral-500 mt-0.5">Add a contact to your pipeline.</p>
              </div>
              <button
                type="button"
                onClick={() => { setCreateOpen(false); setCreateForm(EMPTY_FORM) }}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateContact} className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">First Name</label>
                  <input
                    type="text"
                    value={createForm.first_name}
                    onChange={e => updateForm('first_name', e.target.value)}
                    placeholder="Jane"
                    className="w-full rounded-lg border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/40 placeholder:text-neutral-600"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={createForm.last_name}
                    onChange={e => updateForm('last_name', e.target.value)}
                    placeholder="Smith"
                    className="w-full rounded-lg border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/40 placeholder:text-neutral-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">Email</label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={e => updateForm('email', e.target.value)}
                  placeholder="jane@company.com"
                  className="w-full rounded-lg border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/40 placeholder:text-neutral-600"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">Company</label>
                <input
                  type="text"
                  value={createForm.company}
                  onChange={e => updateForm('company', e.target.value)}
                  placeholder="Acme Corp"
                  className="w-full rounded-lg border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/40 placeholder:text-neutral-600"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">Phone</label>
                <input
                  type="tel"
                  value={createForm.phone}
                  onChange={e => updateForm('phone', e.target.value)}
                  placeholder="+1 555 000 0000"
                  className="w-full rounded-lg border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/40 placeholder:text-neutral-600"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">Owner <span className="text-neutral-600">(optional)</span></label>
                <EntitySearch
                  type="rep"
                  value={createOwnerSelection}
                  onChange={setCreateOwnerSelection}
                />
              </div>
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-neutral-800">
                <p className="text-[10px] text-neutral-600">
                  {/* TODO: wire to POST /v1/crm/contacts when available */}
                  Contact creation isn’t available yet.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setCreateOpen(false); setCreateForm(EMPTY_FORM) }}
                    className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createSaving}
                    className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-300 opacity-60 cursor-not-allowed"
                    title="Backend endpoint not yet available"
                  >
                    {createSaving ? 'Saving…' : 'Create'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
