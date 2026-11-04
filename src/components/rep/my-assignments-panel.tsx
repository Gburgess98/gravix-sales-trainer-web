'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Badge, GlassCard, Panel, PanelHeader, Segmented, ErrorPanel, LoadingRows, dsButton, dsField } from '@/components/ds'
import {
  compareTodo,
  dueStateOf,
  dueText,
  evidenceOf,
  filterTodo,
  groupOf,
  managerNote,
  primaryAction,
  reviewedByManager,
  sortDone,
  sourceLabel,
  summarise,
  typeLabel,
  whyText,
  type DueFilter,
  type MyAssignment,
} from '@/lib/my-assignments-model'

/* Rep "My Assignments" (glass system). Presentational: the page owns data, the complete PATCH and snoozing.
   Priority → summary → one list (To do / Completed). The rep API has no manager name and no feedback
   field beyond the creation note, so "from" says "Your manager" only when a manager id exists and the
   response column only ever shows that note or a real `reviewed` status. */

export type Feed = {
  coaching_summary?: string | null
  weakest_area?: { category?: string; score?: number } | null
  recommended_replay?: { call_id?: string; score?: number } | null
  recommended_drill?: string | null
} | null

export type View = 'todo' | 'done'

type Props = {
  items: MyAssignment[]
  loading: boolean
  error: string | null
  onRetry: () => void
  onComplete: (id: string) => void
  savingId: string | null
  snoozedIds: Set<string>
  onSnooze: (id: string) => void
  onClearSnoozes: () => void
  feed: Feed
  feedUnavailable: boolean
  notice: { type: 'success' | 'error'; text: string } | null
  view: View
  onViewChange: (v: View) => void
  type: string
  onTypeChange: (v: string) => void
  due: DueFilter
  onDueChange: (v: DueFilter) => void
  highlightId?: string | null
}

const fmtDate = (iso?: string | null) => {
  const d = iso ? new Date(iso) : null
  return d && Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }) : null
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'bad' }) {
  return (
    <div>
      <dt className="text-xs text-[var(--ds-text-3)]">{label}</dt>
      <dd className={`mt-0.5 text-2xl font-semibold tabular-nums ${tone === 'bad' && Number(value) > 0 ? 'text-red-200' : 'text-[var(--ds-text)]'}`}>{value}</dd>
    </div>
  )
}

const Quiet = ({ children }: { children: React.ReactNode }) => <p className="px-5 py-6 text-sm text-[var(--ds-text-2)] sm:px-6">{children}</p>

function ActionButton({ a, saving, onComplete, size = 'sm' }: { a: MyAssignment; saving: boolean; onComplete: (id: string) => void; size?: 'sm' | 'md' }) {
  const act = primaryAction(a)
  if (!act) return null
  if (act.kind === 'link') {
    return (
      <span className="inline-flex flex-col items-end gap-1">
        <Link href={act.href} className={dsButton('primary', size)}>{act.label}</Link>
        {act.hint && <span className="text-[11px] text-[var(--ds-text-3)]">No persona set · default</span>}
      </span>
    )
  }
  return <button type="button" onClick={() => onComplete(a.id)} disabled={saving} className={dsButton('primary', size)}>{saving ? 'Saving…' : act.label}</button>
}

export function MyAssignmentsPanel(p: Props) {
  const { items, loading, error, view, type, due } = p
  const [now] = useState(() => new Date())
  const visibleItems = useMemo(() => items.filter((a) => !(groupOf(a) === 'todo' && p.snoozedIds.has(a.id))), [items, p.snoozedIds])
  const todoAll = useMemo(() => visibleItems.filter((a) => groupOf(a) === 'todo').sort((a, b) => compareTodo(a, b, now)), [visibleItems, now])
  const doneAll = useMemo(() => sortDone(visibleItems.filter((a) => groupOf(a) === 'done')), [visibleItems])
  const counts = useMemo(() => summarise(visibleItems, now), [visibleItems, now])
  const types = useMemo(() => Array.from(new Set(todoAll.map((a) => String(a.type ?? '')).filter(Boolean))).sort(), [todoAll])
  const todo = useMemo(() => filterTodo(todoAll, { type, due }, now) as MyAssignment[], [todoAll, type, due, now])
  const filtersActive = type !== 'all' || due !== 'all'
  const clear = () => { p.onTypeChange('all'); p.onDueChange('all') }
  const ready = !loading && !error
  const top = todoAll[0] ?? null
  const topDue = top ? dueStateOf(top, now) : null
  const weakest = p.feed?.weakest_area?.category?.trim() || null
  const replayId = p.feed?.recommended_replay?.call_id || null
  const note = top ? managerNote(top) : null
  const why = top ? whyText(top) : null
  const snoozedCount = items.filter((a) => groupOf(a) === 'todo' && p.snoozedIds.has(a.id)).length

  return (
    <div className="space-y-6">
      <GlassCard>
        <dl className="grid grid-cols-3 gap-x-6">
          <Stat label="To do" value={ready ? counts.todo : '—'} />
          <Stat label="Overdue" value={ready ? counts.overdue : '—'} tone="bad" />
          <Stat label="Completed, 7 days" value={ready ? counts.doneRecent : '—'} />
        </dl>
      </GlassCard>

      {ready && (
        <GlassCard>
          {top ? (
            <>
              <h2 className="text-xs font-medium text-[var(--ds-text-3)]">Do this first</h2>
              <div className="mt-2 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="text-xl font-semibold tracking-tight text-[var(--ds-text)]">{top.title || 'Untitled assignment'}</p>
                  <p className="mt-1 text-sm text-[var(--ds-text-2)]">
                    {typeLabel(top.type)}
                    {sourceLabel(top) ? ` · ${sourceLabel(top)}` : ''}
                    {' · '}
                    <span className={topDue === 'overdue' ? 'text-red-200' : undefined}>{dueText(top, now)}</span>
                  </p>
                  {why && <p className="mt-2 text-sm text-[var(--ds-text-2)]">{why}.</p>}
                  {note && <p className="mt-2 max-w-2xl text-sm text-[var(--ds-text-2)]"><span className="text-[var(--ds-text-3)]">Manager’s note: </span>{note}</p>}
                </div>
                <div className="shrink-0"><ActionButton a={top} saving={p.savingId === top.id} onComplete={p.onComplete} size="md" /></div>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-xs font-medium text-[var(--ds-text-3)]">Do this first</h2>
              {p.feed?.recommended_drill ? (
                <div className="mt-2 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <p className="text-xl font-semibold tracking-tight text-[var(--ds-text)]">{p.feed.recommended_drill}</p>
                    <p className="mt-1 text-sm text-[var(--ds-text-2)]">{p.feed.coaching_summary || 'Suggested from your recent calls.'} Nothing is assigned to you right now.</p>
                  </div>
                  <Link href="/call-library?tab=sparring" className={dsButton('primary', 'md', 'shrink-0')}>Practise</Link>
                </div>
              ) : (
                <div className="mt-2 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-[var(--ds-text-2)]">Nothing is assigned to you right now.</p>
                  <div className="flex flex-wrap gap-2">
                    <Link href="/call-library" className={dsButton('secondary', 'sm')}>Review a call</Link>
                    <Link href="/call-library?tab=sparring" className={dsButton('secondary', 'sm')}>Practise</Link>
                  </div>
                </div>
              )}
            </>
          )}
          {(weakest || replayId) && (
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--ds-border)] pt-3 text-sm text-[var(--ds-text-2)]">
              {weakest && (
                <span>
                  Weakest area: <span className="text-[var(--ds-text)]">{weakest}</span>
                  {typeof p.feed?.weakest_area?.score === 'number' ? ` (${Math.round(p.feed.weakest_area.score)})` : ''}
                </span>
              )}
              {weakest && <Link href="/call-library?tab=sparring" className={dsButton('quiet', 'sm')}>Practise a persona</Link>}
              {replayId && <Link href={`/calls/${encodeURIComponent(replayId)}`} className={dsButton('quiet', 'sm')}>Review suggested call</Link>}
            </div>
          )}
          {p.feedUnavailable && <p className="mt-3 text-xs text-[var(--ds-text-3)]">Skill suggestions are unavailable right now.</p>}
        </GlassCard>
      )}

      <div role="status" aria-live="polite" className={p.notice ? 'text-sm' : 'sr-only'}>
        {p.notice && <p className={p.notice.type === 'success' ? 'text-emerald-200' : 'text-red-200'}>{p.notice.text}</p>}
      </div>

      <Panel>
        <PanelHeader
          title="My assignments"
          action={
            <Segmented
              label="Show assignments"
              value={view}
              onChange={(v) => p.onViewChange(v as View)}
              options={[
                { value: 'todo', label: ready ? `To do (${counts.todo})` : 'To do' },
                { value: 'done', label: ready ? `Completed (${counts.done})` : 'Completed' },
              ]}
            />
          }
        />
        {view === 'todo' && ready && todoAll.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--ds-border)] px-4 py-3 sm:px-5">
            <select aria-label="Filter by type" value={type} onChange={(e) => p.onTypeChange(e.target.value)} className={`${dsField} !w-auto min-w-36`}>
              <option value="all">All types</option>
              {types.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
            </select>
            <select aria-label="Filter by due date" value={due} onChange={(e) => p.onDueChange(e.target.value as DueFilter)} className={`${dsField} !w-auto min-w-36`}>
              <option value="all">Any due date</option>
              <option value="overdue">Overdue</option>
              <option value="today">Due today</option>
              <option value="upcoming">Upcoming</option>
              <option value="none">No due date</option>
            </select>
            {filtersActive && <button type="button" onClick={clear} className={dsButton('quiet', 'sm')}>Clear filters</button>}
            <span className="ml-auto text-xs text-[var(--ds-text-3)]">Showing {todo.length} of {todoAll.length}</span>
          </div>
        )}

        {loading ? (
          <LoadingRows rows={4} label="Loading your assignments" />
        ) : error ? (
          <ErrorPanel title="Couldn’t load your assignments" body="Your assignments are unavailable right now. Nothing has changed." onRetry={p.onRetry} />
        ) : view === 'todo' ? (
          todoAll.length === 0 ? (
            <Quiet>You have no assignments to do.</Quiet>
          ) : todo.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-6 sm:px-6">
              <p className="text-sm text-[var(--ds-text-2)]">No assignments match these filters.</p>
              <button type="button" onClick={clear} className={dsButton('secondary', 'sm')}>Clear filters</button>
            </div>
          ) : (
            <ul aria-label="Assignments to do" className="divide-y divide-[var(--ds-border)]">
              {todo.map((a) => {
                const ds = dueStateOf(a, now)
                const from = sourceLabel(a)
                const mNote = managerNote(a)
                return (
                  <li key={a.id} data-assignment-id={a.id} className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3.5 sm:px-5 ${p.highlightId === a.id ? 'bg-white/[0.04]' : ''}`}>
                    <div className="min-w-0 flex-1 basis-64">
                      <p className="truncate text-sm font-medium text-[var(--ds-text)]">{a.title || 'Untitled assignment'}</p>
                      <p className="mt-0.5 truncate text-xs text-[var(--ds-text-3)]">
                        {typeLabel(a.type)}{from ? ` · ${from}` : ''} · <span className={ds === 'overdue' ? 'text-red-200' : undefined}>{dueText(a, now)}</span>
                      </p>
                      {whyText(a) && <p className="mt-0.5 truncate text-xs text-[var(--ds-text-3)]">{whyText(a)}</p>}
                      {mNote && <p className="mt-0.5 line-clamp-2 text-xs text-[var(--ds-text-2)]">Manager’s note: {mNote}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {ds === 'overdue' ? <Badge tone="bad">Overdue</Badge> : ds === 'today' ? <Badge tone="warn">Due today</Badge> : <Badge>To do</Badge>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <ActionButton a={a} saving={p.savingId === a.id} onComplete={p.onComplete} />
                      {String(a.type ?? '') === 'custom' && <button type="button" onClick={() => p.onSnooze(a.id)} className={dsButton('quiet', 'sm')}>Snooze 24h</button>}
                    </div>
                  </li>
                )
              })}
            </ul>
          )
        ) : doneAll.length === 0 ? (
          <Quiet>Nothing completed yet. Finished assignments appear here.</Quiet>
        ) : (
          <ul aria-label="Completed assignments" className="divide-y divide-[var(--ds-border)]">
            {doneAll.map((a) => {
              const ev = evidenceOf(a)
              const when = fmtDate(a.completed_at)
              const from = sourceLabel(a)
              return (
                <li key={a.id} data-assignment-id={a.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3.5 sm:px-5">
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="truncate text-sm font-medium text-[var(--ds-text)]">{a.title || 'Untitled assignment'}</p>
                    <p className="mt-0.5 truncate text-xs text-[var(--ds-text-3)]">
                      {typeLabel(a.type)}{from ? ` · ${from}` : ''} · {when ? `Completed ${when}` : 'Completion date not recorded'}{a.completed_by === 'rep' ? ' by you' : ''}
                    </p>
                    {ev && <p className="mt-0.5 truncate text-xs text-[var(--ds-text-3)]">{ev.detail}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {ev && <Badge tone="info">{ev.label}</Badge>}
                    {reviewedByManager(a) ? <Badge tone="good">Reviewed by your manager</Badge> : <Badge tone="good">Completed</Badge>}
                  </div>
                  <ActionButton a={a} saving={false} onComplete={p.onComplete} />
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
      {ready && snoozedCount > 0 && view === 'todo' && (
        <p className="text-xs text-[var(--ds-text-3)]">
          {snoozedCount} snoozed {snoozedCount === 1 ? 'task is' : 'tasks are'} hidden for 24 hours.{' '}
          <button type="button" onClick={p.onClearSnoozes} className="underline underline-offset-2 hover:text-[var(--ds-text)]">Show again</button>
        </p>
      )}
    </div>
  )
}
