'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Badge, GlassCard, Panel, PanelHeader, Segmented, SearchInput, EmptyPanel, LoadingRows, dsButton, dsField } from '@/components/ds'
import {
  dueStateOf,
  evidenceOf,
  filterAssignments,
  sortAssignments,
  statusOf,
  summarise,
  typeLabel,
  type AssignmentFilters,
  type AssignmentLike,
  type AssignmentStatus,
  type AssignmentsFailure,
} from '@/lib/assignments-model'

/* Manager Assignments (glass system). Presentational: the page owns data and the PATCH handler.
   Summary → filters → one list. Inspect is an inline disclosure; Mark complete uses the existing
   PATCH /v1/assignments/manager/:id (server-side ownership rules unchanged) behind a two-step confirm.
   Reassign is deliberately absent: that endpoint does not accept a new assignee. */

const STATUS_BADGE: Record<AssignmentStatus, { label: string; tone: 'neutral' | 'good' | 'bad' }> = {
  open: { label: 'Open', tone: 'neutral' },
  overdue: { label: 'Overdue', tone: 'bad' },
  completed: { label: 'Completed', tone: 'good' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
}

const fmtDate = (iso?: string | null) => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }) : null
}

function dueText(a: AssignmentLike, now: Date) {
  const date = fmtDate(a.due_at)
  if (!date) return 'No due date'
  const st = dueStateOf(a, now)
  if (statusOf(a, now) === 'completed') return `Was due ${date}`
  if (st === 'overdue') return `Overdue · ${date}`
  if (st === 'today') return 'Due today'
  return `Due ${date}`
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'bad' }) {
  return (
    <div>
      <dt className="text-xs text-[var(--ds-text-3)]">{label}</dt>
      <dd className={`mt-0.5 text-2xl font-semibold tabular-nums ${tone === 'bad' && Number(value) > 0 ? 'text-red-200' : 'text-[var(--ds-text)]'}`}>{value}</dd>
    </div>
  )
}

/** One distinct state per cause. Permission is calm and has no retry (retrying a refusal never helps). */
function FailurePanel({ failure, onRetry }: { failure: AssignmentsFailure; onRetry: () => void }) {
  const tone = failure.kind === 'permission' || failure.kind === 'unauthenticated' ? 'text-[var(--ds-text)]' : 'text-red-200'
  return (
    <div role={failure.kind === 'permission' ? 'status' : 'alert'} data-failure={failure.kind} className="px-6 py-12 text-center">
      <p className={`text-sm font-medium ${tone}`}>{failure.title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-[var(--ds-text-3)]">{failure.body}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {failure.retryable && <button type="button" onClick={onRetry} className={dsButton('secondary', 'sm')}>Try again</button>}
        {failure.kind === 'unauthenticated' && <Link href="/login" className={dsButton('primary', 'sm')}>Sign in</Link>}
        {failure.kind === 'permission' && <Link href="/assignments" className={dsButton('secondary', 'sm')}>Go to my assignments</Link>}
      </div>
    </div>
  )
}

type Props = {
  items: AssignmentLike[]
  loading: boolean
  /** Exactly one failure kind (permission / session / server / network), or null when the list loaded. */
  failure: AssignmentsFailure | null
  /** Partial failure: the list loaded but something around it did not (e.g. rep names). Rows still render. */
  notice?: string | null
  onRetry: () => void
  repName: (id: string | null | undefined) => string
  onComplete: (id: string) => Promise<{ ok: boolean; text: string }>
  completingId: string | null
  /** The API list is capped; say so instead of implying completeness. */
  limit?: number
}

export function AssignmentsPanel({ items, loading, failure, notice: partialNotice, onRetry, repName, onComplete, completingId, limit = 100 }: Props) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<AssignmentFilters['status']>('all')
  const [rep, setRep] = useState('all')
  const [type, setType] = useState('all')
  const [due, setDue] = useState<AssignmentFilters['due']>('all')
  const [openId, setOpenId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  // Re-stamp "now" whenever the list refreshes so overdue/due-today stay current.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => new Date(), [items])
  const counts = useMemo(() => summarise(items, now), [items, now])
  const reps = useMemo(() => {
    const ids = Array.from(new Set(items.map((a) => String(a.rep_id ?? '')).filter(Boolean)))
    return ids.map((id) => ({ id, name: repName(id) })).sort((a, b) => a.name.localeCompare(b.name))
  }, [items, repName])
  const types = useMemo(() => Array.from(new Set(items.map((a) => String(a.type ?? '')).filter(Boolean))).sort(), [items])

  const visible = useMemo(
    () => sortAssignments(filterAssignments(items, { q, status, rep, type, due }, repName, now), now),
    [items, q, status, rep, type, due, repName, now],
  )
  const filtersActive = Boolean(q.trim()) || status !== 'all' || rep !== 'all' || type !== 'all' || due !== 'all'
  const clear = () => { setQ(''); setStatus('all'); setRep('all'); setType('all'); setDue('all') }

  async function complete(id: string) {
    setConfirmId(null)
    setNotice(await onComplete(id))
  }

  return (
    <div className="space-y-6">
      <GlassCard>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ds-text)]">Assignments</h2>
            <p className="mt-1 text-sm text-[var(--ds-text-2)]">Coaching work across your team, overdue first.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin/assignments/create" className={dsButton('primary', 'sm')}>Create assignment</Link>
            <Link href="/admin/assignments" className={dsButton('secondary', 'sm')}>Assignment manager</Link>
            <button type="button" onClick={onRetry} className={dsButton('quiet', 'sm')}>Refresh</button>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-3 gap-x-6 border-t border-[var(--ds-border)] pt-4">
          <Stat label="Open" value={loading || failure ? '—' : counts.open} />
          <Stat label="Overdue" value={loading || failure ? '—' : counts.overdue} tone="bad" />
          <Stat label="Completed" value={loading || failure ? '—' : counts.completed} />
        </dl>
        {!loading && !failure && items.length >= limit && (
          <p className="mt-3 text-xs text-[var(--ds-text-3)]">Counts cover the {limit} most recent assignments loaded, not your full history.</p>
        )}
      </GlassCard>

      <GlassCard as="div" className="!p-3 sm:!p-4">
        <div className="space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="md:flex-1">
              <SearchInput label="Search assignments" placeholder="Search by rep, title or notes…" value={q} onChange={setQ} />
            </div>
            <Segmented
              label="Filter by status"
              value={status ?? 'all'}
              onChange={(v) => setStatus(v as AssignmentFilters['status'])}
              options={[
                { value: 'all', label: 'All' },
                { value: 'open', label: 'Open' },
                { value: 'overdue', label: 'Overdue' },
                { value: 'completed', label: 'Completed' },
              ]}
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
            <select aria-label="Filter by rep" value={rep} onChange={(e) => setRep(e.target.value)} className={dsField}>
              <option value="all">All reps</option>
              {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)} className={dsField}>
              <option value="all">All types</option>
              {types.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
            </select>
            <select aria-label="Filter by due date" value={due ?? 'all'} onChange={(e) => setDue(e.target.value as AssignmentFilters['due'])} className={dsField}>
              <option value="all">Any due date</option>
              <option value="overdue">Overdue</option>
              <option value="today">Due today</option>
              <option value="week">Due in 7 days</option>
              <option value="later">Due later</option>
              <option value="none">No due date</option>
            </select>
            {filtersActive && <button type="button" onClick={clear} className={dsButton('quiet', 'sm')}>Clear filters</button>}
          </div>
        </div>
      </GlassCard>

      {partialNotice && !failure && (
        <p role="status" className="rounded-[var(--ds-radius-control)] border border-amber-300/25 bg-amber-300/[0.06] px-4 py-2.5 text-sm text-amber-100">{partialNotice}</p>
      )}

      <div role="status" aria-live="polite" className="text-sm empty:-mt-6 empty:h-0">
        {notice && <p className={notice.ok ? 'text-emerald-200' : 'text-red-200'}>{notice.text}</p>}
      </div>

      <Panel>
        <PanelHeader title="All assignments" meta={loading || failure ? undefined : `Showing ${visible.length} of ${items.length}`} />
        {loading ? (
          <LoadingRows rows={5} label="Loading assignments" />
        ) : failure ? (
          <FailurePanel failure={failure} onRetry={onRetry} />
        ) : items.length === 0 ? (
          <EmptyPanel
            title="No assignments yet"
            body="Assign a drill from a call review, or create one directly."
            action={<Link href="/admin/assignments/create" className={dsButton('primary', 'md')}>Create assignment</Link>}
          />
        ) : visible.length === 0 ? (
          <EmptyPanel title="No assignments match" body="Try a different search or clear a filter." action={<button type="button" onClick={clear} className={dsButton('secondary', 'md')}>Clear filters</button>} />
        ) : (
          <ul aria-label="Assignments" className="divide-y divide-[var(--ds-border)]">
            {visible.map((a) => {
              const st = statusOf(a, now)
              const badge = STATUS_BADGE[st]
              const ev = evidenceOf(a)
              const isOpen = openId === a.id
              const detailId = `assignment-detail-${a.id}`
              const canComplete = st === 'open' || st === 'overdue'
              const notes = String(a.meta?.coaching_notes ?? '').trim()
              const origin = String(a.source ?? a.meta?.assignment_origin ?? '').toLowerCase()
              const originLabel = origin === 'manager_review' ? 'Assigned via review' : origin.includes('auto') ? 'Auto-created' : origin ? 'Manual assignment' : null
              return (
                <li key={a.id}>
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3.5 sm:px-5">
                    <div className="min-w-0 flex-1 basis-64">
                      <p className="truncate text-sm font-medium text-[var(--ds-text)]">{a.title || 'Untitled assignment'}</p>
                      <p className="mt-0.5 truncate text-xs text-[var(--ds-text-3)]">
                        {repName(a.rep_id)} · {typeLabel(a.type)} · <span className={st === 'overdue' ? 'text-red-200' : undefined}>{dueText(a, now)}</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {ev && <Badge tone="info">{ev.label}</Badge>}
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      {confirmId === a.id ? (
                        <>
                          <button type="button" onClick={() => void complete(a.id)} className={dsButton('primary', 'sm')}>Confirm complete</button>
                          <button type="button" onClick={() => setConfirmId(null)} className={dsButton('quiet', 'sm')}>Cancel</button>
                        </>
                      ) : (
                        <>
                          {canComplete && (
                            <button type="button" onClick={() => setConfirmId(a.id)} disabled={completingId === a.id} className={dsButton('secondary', 'sm')}>
                              {completingId === a.id ? 'Completing…' : 'Mark complete'}
                            </button>
                          )}
                          <button type="button" aria-expanded={isOpen} aria-controls={detailId} onClick={() => setOpenId(isOpen ? null : a.id)} className={dsButton('quiet', 'sm')}>
                            {isOpen ? 'Hide details' : 'Details'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {isOpen && (
                    <div id={detailId} className="border-t border-[var(--ds-border)] bg-white/[0.02] px-4 py-4 sm:px-5">
                      <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
                        <div><dt className="text-xs text-[var(--ds-text-3)]">Rep</dt><dd className="text-[var(--ds-text)]">{repName(a.rep_id)}</dd></div>
                        <div><dt className="text-xs text-[var(--ds-text-3)]">Type</dt><dd className="text-[var(--ds-text)]">{typeLabel(a.type)}{originLabel ? ` · ${originLabel}` : ''}</dd></div>
                        <div><dt className="text-xs text-[var(--ds-text-3)]">Created</dt><dd className="text-[var(--ds-text)]">{fmtDate(a.created_at) ?? '—'}</dd></div>
                        <div><dt className="text-xs text-[var(--ds-text-3)]">{st === 'completed' ? 'Completed' : 'Due'}</dt><dd className="text-[var(--ds-text)]">{st === 'completed' ? (fmtDate(a.completed_at) ?? '—') : (fmtDate(a.due_at) ?? 'No due date')}</dd></div>
                        {notes && <div className="sm:col-span-2"><dt className="text-xs text-[var(--ds-text-3)]">Coaching notes</dt><dd className="text-[var(--ds-text-2)]">{notes}</dd></div>}
                        <div className="sm:col-span-2">
                          <dt className="text-xs text-[var(--ds-text-3)]">Evidence</dt>
                          <dd className="text-[var(--ds-text-2)]">{ev ? ev.detail : 'No proof attached yet.'}</dd>
                        </div>
                      </dl>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {ev?.callId && <Link href={`/calls/${encodeURIComponent(ev.callId)}`} className={dsButton('secondary', 'sm')}>Open call</Link>}
                        {a.rep_id && <Link href={`/crm/reps/${encodeURIComponent(String(a.rep_id))}`} className={dsButton('secondary', 'sm')}>Open rep</Link>}
                        <Link href="/admin/assignments" className={dsButton('quiet', 'sm')}>Open in assignment manager</Link>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
      {!loading && !failure && items.length >= limit && (
        <p className="text-xs text-[var(--ds-text-3)]">Showing the {limit} most recent assignments. Use the assignment manager for the full history.</p>
      )}
    </div>
  )
}
