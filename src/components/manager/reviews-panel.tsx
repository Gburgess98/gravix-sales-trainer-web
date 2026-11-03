'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Badge, GlassCard, Panel, PanelHeader, Segmented, SearchInput, ErrorPanel, LoadingRows, dsButton, dsField } from '@/components/ds'
import { RAG_META, ragFromScore } from '@/lib/manager-model'
import { formatCallDisplayTitle, weakestSkillLabel } from '@/lib/callDisplay'
import {
  LONG_WAIT_DAYS,
  ageDays,
  ageLabel,
  filterReviews,
  isLongWait,
  sortReviews,
  summariseReviews,
  type AgeFilter,
  type ReviewItemLike,
  type ReviewSort,
  type ScoreBand,
} from '@/lib/reviews-model'

/* Manager Reviews queue (glass system). Presentational: the page owns data, the mark-reviewed POST and the
   assign-coaching modal. Waiting calls and reviewed calls are separate sections. The API has no due dates or
   review log, so age is derived from the call date and "reviewed" lists only what was marked in this view. */

export type ReviewRow = ReviewItemLike & { callId: string; weakestSkill?: string | null }

type Props = {
  items: ReviewRow[]
  loading: boolean
  error: string | null
  onRetry: () => void
  repName: (item: ReviewItemLike) => string
  /** Existing POST /v1/calls/:id/manager-review handler; resolves true on success. */
  onMarkReviewed: (callId: string) => Promise<boolean>
  markingId: string | null
  onAssign: (callId: string) => void
  notice: { type: 'success' | 'error'; text: string } | null
  /** Count from the command centre (30 days). null = not available (loading or failed). */
  reviewedCount: number | null
  reviewedUnavailable: boolean
  limit?: number
  windowDays?: number
}

function Stat({ label, value, note, tone }: { label: string; value: number | string; note?: string; tone?: 'bad' | 'warn' }) {
  const cls = tone === 'bad' && Number(value) > 0 ? 'text-red-200' : tone === 'warn' && Number(value) > 0 ? 'text-amber-200' : 'text-[var(--ds-text)]'
  return (
    <div>
      <dt className="text-xs text-[var(--ds-text-3)]">{label}</dt>
      <dd className={`mt-0.5 text-2xl font-semibold tabular-nums ${cls}`}>{value}</dd>
      {note && <dd className="text-[11px] text-[var(--ds-text-3)]">{note}</dd>}
    </div>
  )
}

const Quiet = ({ children }: { children: React.ReactNode }) => <p className="px-5 py-6 text-sm text-[var(--ds-text-2)] sm:px-6">{children}</p>

export function ReviewsPanel({ items, loading, error, onRetry, repName, onMarkReviewed, markingId, onAssign, notice, reviewedCount, reviewedUnavailable, limit = 25, windowDays = 30 }: Props) {
  const [q, setQ] = useState('')
  const [band, setBand] = useState<ScoreBand>('all')
  const [rep, setRep] = useState('all')
  const [age, setAge] = useState<AgeFilter>('any')
  const [sort, setSort] = useState<ReviewSort>('score')
  const [doneHere, setDoneHere] = useState<Array<{ row: ReviewRow; name: string }>>([])
  const listHeading = useRef<HTMLDivElement>(null)

  // Re-stamp "now" whenever the list refreshes so ages stay current.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => new Date(), [items])
  const counts = useMemo(() => summariseReviews(items, now), [items, now])
  const reps = useMemo(() => {
    const seen = new Map<string, string>()
    for (const i of items) if (i.repId && !seen.has(String(i.repId))) seen.set(String(i.repId), repName(i))
    return Array.from(seen, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  }, [items, repName])
  const visible = useMemo(
    () => sortReviews(filterReviews(items, { q, rep, band, age }, repName, now) as ReviewRow[], sort),
    [items, q, rep, band, age, sort, repName, now],
  )
  const filtersActive = Boolean(q.trim()) || band !== 'all' || rep !== 'all' || age !== 'any'
  const clear = () => { setQ(''); setBand('all'); setRep('all'); setAge('any') }
  const ready = !loading && !error

  async function markReviewed(row: ReviewRow) {
    const name = repName(row)
    if (await onMarkReviewed(row.callId)) {
      setDoneHere((d) => [{ row, name }, ...d.filter((x) => x.row.callId !== row.callId)])
      // The row leaves the queue; keep keyboard focus inside the section instead of dropping to <body>.
      listHeading.current?.focus()
    }
  }

  return (
    <div className="space-y-6">
      <GlassCard>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ds-text)]">Reviews</h2>
            <p className="mt-1 text-sm text-[var(--ds-text-2)]">Scored calls that need a manager look, lowest score first.</p>
          </div>
          <button type="button" onClick={onRetry} className={dsButton('quiet', 'sm')}>Refresh</button>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-[var(--ds-border)] pt-4 sm:grid-cols-4">
          <Stat label="Waiting for review" value={ready ? counts.waiting : '—'} />
          <Stat label={`Waiting ${LONG_WAIT_DAYS}+ days`} value={ready ? counts.waitingLong : '—'} note="by call date" tone="warn" />
          <Stat label="Score below 55" value={ready ? counts.lowScore : '—'} tone="bad" />
          <Stat label={`Reviewed, ${windowDays} days`} value={reviewedCount ?? '—'} />
        </dl>
      </GlassCard>

      <GlassCard as="div" className="!p-3 sm:!p-4">
        <div className="space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="md:flex-1">
              <SearchInput label="Search reviews" placeholder="Search by rep, call or skill…" value={q} onChange={setQ} />
            </div>
            <Segmented
              label="Filter by score"
              value={band}
              onChange={(v) => setBand(v as ScoreBand)}
              options={[
                { value: 'all', label: 'All' },
                { value: 'low', label: 'Below 55' },
                { value: 'mid', label: '55–69' },
                { value: 'high', label: '70+' },
              ]}
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
            <select aria-label="Filter by rep" value={rep} onChange={(e) => setRep(e.target.value)} className={dsField}>
              <option value="all">All reps</option>
              {reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <select aria-label="Filter by age" value={age} onChange={(e) => setAge(e.target.value as AgeFilter)} className={dsField}>
              <option value="any">Any age</option>
              <option value="recent">Under {LONG_WAIT_DAYS} days</option>
              <option value="waiting3">{LONG_WAIT_DAYS}+ days</option>
              <option value="waiting7">7+ days</option>
            </select>
            <select aria-label="Sort reviews" value={sort} onChange={(e) => setSort(e.target.value as ReviewSort)} className={dsField}>
              <option value="score">Lowest score first</option>
              <option value="oldest">Oldest first</option>
            </select>
            {filtersActive && <button type="button" onClick={clear} className={dsButton('quiet', 'sm')}>Clear filters</button>}
          </div>
        </div>
      </GlassCard>

      <div role="status" aria-live="polite" className={notice ? 'text-sm' : 'sr-only'}>
        {notice && <p className={notice.type === 'success' ? 'text-emerald-200' : 'text-red-200'}>{notice.text}</p>}
      </div>

      <div ref={listHeading} tabIndex={-1} className="outline-none">
      <Panel>
        <PanelHeader
          title="Waiting for review"
          meta={ready ? `Showing ${visible.length} of ${items.length} · last ${windowDays} days` : undefined}
        />
        {loading ? (
          <LoadingRows rows={5} label="Loading reviews" />
        ) : error ? (
          <ErrorPanel title="Couldn’t load the review queue" body={error} onRetry={onRetry} />
        ) : items.length === 0 ? (
          <Quiet>Nothing is waiting for review.</Quiet>
        ) : visible.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-6 sm:px-6">
            <p className="text-sm text-[var(--ds-text-2)]">No reviews match these filters.</p>
            <button type="button" onClick={clear} className={dsButton('secondary', 'sm')}>Clear filters</button>
          </div>
        ) : (
          <ul aria-label="Calls waiting for review" className="divide-y divide-[var(--ds-border)]">
            {visible.map((item) => {
              const name = repName(item)
              const rag = ragFromScore(item.overallScore)
              const long = isLongWait(item, now)
              const days = ageDays(item.createdAt, now)
              const reasons = (item.reasons ?? []).filter(Boolean)
              return (
                <li key={item.callId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 py-3.5 sm:px-5">
                  <div className="min-w-0 flex-1 basis-64">
                    <p className="truncate text-sm font-medium text-[var(--ds-text)]">
                      {formatCallDisplayTitle({ title: item.title, repName: name, weakestSkill: item.weakestSkill })}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-[var(--ds-text-3)]">
                      {name} · Weakest: {weakestSkillLabel(item.weakestSkill)} · <span className={long ? 'text-amber-200' : undefined}>{ageLabel(item.createdAt, now)}</span>
                    </p>
                    {reasons.length > 0 && <p className="mt-0.5 truncate text-xs text-[var(--ds-text-3)]">{reasons.join(' · ')}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {rag && typeof item.overallScore === 'number' && (
                      <Badge tone={RAG_META[rag].tone}>Score {Math.round(item.overallScore)}</Badge>
                    )}
                    <Badge tone={long ? 'warn' : 'neutral'}>{long && days !== null ? `Waiting ${days} days` : 'Waiting'}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/calls/${item.callId}`} className={dsButton('primary', 'sm')}>Review call</Link>
                    <button type="button" onClick={() => void markReviewed(item)} disabled={markingId === item.callId} className={dsButton('quiet', 'sm')}>
                      {markingId === item.callId ? 'Marking…' : 'Mark reviewed'}
                    </button>
                    <button type="button" onClick={() => onAssign(item.callId)} className={dsButton('quiet', 'sm')}>Assign coaching</button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
      </div>
      {ready && items.length >= limit && (
        <p className="text-xs text-[var(--ds-text-3)]">Showing the {limit} lowest-scoring calls. Clear the queue to see more.</p>
      )}

      <Panel>
        <PanelHeader title="Recently reviewed" meta={`Last ${windowDays} days`} />
        {doneHere.length > 0 && (
          <ul aria-label="Reviewed in this session" className="divide-y divide-[var(--ds-border)]">
            {doneHere.map(({ row, name }) => (
              <li key={row.callId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1 basis-64">
                  <p className="truncate text-sm text-[var(--ds-text)]">{formatCallDisplayTitle({ title: row.title, repName: name, weakestSkill: row.weakestSkill })}</p>
                  <p className="mt-0.5 truncate text-xs text-[var(--ds-text-3)]">{name}</p>
                </div>
                <Badge tone="good">Reviewed just now</Badge>
                <Link href={`/calls/${row.callId}`} className={dsButton('quiet', 'sm')}>Open call</Link>
              </li>
            ))}
          </ul>
        )}
        <Quiet>
          {reviewedUnavailable
            ? 'Review totals are unavailable right now.'
            : reviewedCount === null
              ? 'Loading review totals…'
              : `${reviewedCount} ${reviewedCount === 1 ? 'call' : 'calls'} reviewed in the last ${windowDays} days. Individual reviews are not listed yet; calls you mark here appear above.`}
        </Quiet>
      </Panel>
    </div>
  )
}
