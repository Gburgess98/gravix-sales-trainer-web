'use client'

import Link from 'next/link'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, GlassCard, Panel, PanelHeader, Segmented, ErrorPanel, LoadingRows, dsButton } from '@/components/ds'
import { RAG_META, ragFromScore } from '@/lib/manager-model'
import { xpLevel, computeStreak, trendDirection, type DailyFeed, type TrendPoint } from '@/lib/progress-model'
import type { MyAssignment } from '@/lib/my-assignments-model'
import {
  chartPoints,
  comparisonLabel,
  completedCounts,
  headline,
  isTruncated,
  openCount,
  recentCompleted,
  scoredOverall,
  skillRows,
  strongestWeakest,
  summarisePeriods,
  type Range,
  type WeaknessTrends,
} from '@/lib/progress-view-model'

/* Rep Progress (glass system). Presentational: the page owns the fetches (all the rep's OWN data).
   Order answers the rep's questions: am I improving → strongest/weakest + what next → what I completed →
   points/streak (secondary). Every number says where it comes from; derived values are labelled. */

const CHART_LINE = '#60a5fa'
const CHART_GRID = 'rgba(148,163,184,0.14)'
const CHART_TICK = { fill: '#8b97ab', fontSize: 12 }
const CHART_TOOLTIP = { background: '#0d1422', border: '1px solid rgba(148,163,184,0.26)', borderRadius: '10px' }

export type Section<T> = { data: T | null; error: boolean }

type Props = {
  range: Range
  onRangeChange: (r: Range) => void
  loading: boolean
  fatal: boolean
  onRetry: () => void
  trends: Section<WeaknessTrends>
  assignments: Section<MyAssignment[]>
  xp: Section<{ total: number; today: number | null }>
  voice: Section<{ trend: TrendPoint[]; latest: number | null }>
  feed: DailyFeed | null
  now?: Date
}

const fmtDate = (iso?: string | null) => {
  const d = iso ? new Date(iso) : null
  return d && Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null
}

const Note = ({ children }: { children: React.ReactNode }) => <p className="text-xs text-[var(--ds-text-3)]">{children}</p>
const Quiet = ({ children }: { children: React.ReactNode }) => <p className="px-5 py-6 text-sm text-[var(--ds-text-2)] sm:px-6">{children}</p>
const Unavailable = ({ what, onRetry }: { what: string; onRetry: () => void }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-6 sm:px-6">
    <p className="text-sm text-[var(--ds-text-2)]">{what} is unavailable right now.</p>
    <button type="button" onClick={onRetry} className={dsButton('secondary', 'sm')}>Try again</button>
  </div>
)

export function ProgressView(p: Props) {
  const now = p.now ?? new Date()
  const { range } = p
  const overall = p.trends.data?.overall
  const summary = summarisePeriods(overall, range, now)
  const points = chartPoints(overall, range, now)
  const rows = skillRows(p.trends.data, range, now)
  const { strongest, weakest } = strongestWeakest(rows)
  const items = p.assignments.data ?? []
  const done = recentCompleted(items, 5)
  const counts = completedCounts(items, now)
  const open = openCount(items)
  const hasAnyHistory = (overall?.length ?? 0) > 0 || items.length > 0

  const replay = p.feed?.recommended_replay?.call_id ? p.feed.recommended_replay : null
  // The feed picks its "weakest" from the latest call only; show its drill only when it agrees with the period view.
  const drill = weakest && p.feed?.weakest_area?.category === weakest.key && p.feed.recommended_drill ? p.feed.recommended_drill : null

  const voiceDir = p.voice.data && p.voice.data.trend.length > 0 ? trendDirection(p.voice.data.trend) : null
  const level = p.xp.data ? xpLevel(p.xp.data.total) : null
  const streak = p.assignments.data ? computeStreak(items as any) : null

  const rangeControl = (
    <Segmented
      label="Date range"
      value={String(range) as '30' | '90'}
      onChange={(v) => p.onRangeChange(Number(v) as Range)}
      options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }]}
    />
  )

  if (p.loading) {
    return <Panel><LoadingRows rows={5} label="Loading your progress" /></Panel>
  }
  if (p.fatal) {
    return <Panel><ErrorPanel title="Couldn’t load your progress" body="Your progress is unavailable right now. Nothing has changed." onRetry={p.onRetry} /></Panel>
  }

  return (
    <div className="space-y-6">
      <section aria-label="Progress summary">
      <GlassCard>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xs font-medium text-[var(--ds-text-3)]">Am I improving?</h2>
            {p.trends.error ? (
              <p className="mt-2 text-sm text-[var(--ds-text-2)]">Your score history is unavailable right now.</p>
            ) : (
              <p className="mt-2 text-2xl font-semibold tracking-tight text-[var(--ds-text)]">{headline(summary, scoredOverall(overall).length > 0)}</p>
            )}
          </div>
          {rangeControl}
        </div>

        {p.trends.error ? (
          <div className="mt-3"><button type="button" onClick={p.onRetry} className={dsButton('secondary', 'sm')}>Try again</button></div>
        ) : summary.current.avg === null && summary.previous.avg === null ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="text-sm text-[var(--ds-text-2)]">Your trend appears after your first scored calls.</p>
            <Link href="/upload" className={dsButton('primary', 'sm')}>Upload a call</Link>
            <Link href="/call-library?tab=sparring" className={dsButton('quiet', 'sm')}>Practise</Link>
          </div>
        ) : (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {summary.delta !== null && (
                <Badge tone={summary.direction === 'up' ? 'good' : summary.direction === 'down' ? 'warn' : 'neutral'}>
                  {summary.delta > 0 ? '▲' : summary.delta < 0 ? '▼' : '–'} {Math.abs(summary.delta)} pts vs previous {range} days
                </Badge>
              )}
              <span className="text-sm text-[var(--ds-text-2)]">{comparisonLabel(summary)}</span>
            </div>
            {points.length >= 2 ? (
              <div className="mt-4 min-w-0" role="img" aria-label={`Call scores over the last ${range} days: ${points.map((q) => `${q.day} ${q.score}`).join(', ')}`}>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={points} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="progress-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={CHART_LINE} stopOpacity={0.26} />
                        <stop offset="100%" stopColor={CHART_LINE} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={CHART_GRID} vertical={false} />
                    <XAxis dataKey="day" tick={CHART_TICK} axisLine={false} tickLine={false} tickMargin={8} minTickGap={28} />
                    <YAxis domain={[0, 100]} tick={CHART_TICK} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={CHART_TOOLTIP} cursor={{ stroke: 'rgba(148,163,184,0.3)' }} />
                    <Area type="monotone" dataKey="score" name="Call score" stroke={CHART_LINE} strokeWidth={2.5} fill="url(#progress-fill)" dot={{ r: 3 }} activeDot={{ r: 4 }} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="mt-3 text-sm text-[var(--ds-text-3)]">A chart needs at least two scored calls in the last {range} days.</p>
            )}
            <div className="mt-3 space-y-1">
              <Note>Call score = your overall score per call, from your latest 100 calls{isTruncated(overall) ? ' (older calls are not included)' : ''}.</Note>
              {p.voice.data && p.voice.data.latest !== null && (
                <Note>Voice score, daily average: {Math.round(p.voice.data.latest)}{voiceDir ? ` · ${voiceDir === 'improving' ? 'improving' : voiceDir === 'declining' ? 'declining' : 'steady'} over the last ${range} days` : ''}.</Note>
              )}
            </div>
          </>
        )}
      </GlassCard>
      </section>

      <Panel>
        <PanelHeader title="Strongest and weakest skills" meta={`Last ${range} days`} />
        {p.trends.error ? (
          <Unavailable what="Skill scoring" onRetry={p.onRetry} />
        ) : rows.every((r) => r.avg === null) ? (
          <Quiet>No scored stages in the last {range} days.</Quiet>
        ) : (
          <>
            <ul aria-label="Skills" className="divide-y divide-[var(--ds-border)]">
              {rows.map((r) => {
                const rag = ragFromScore(r.avg)
                return (
                  <li key={r.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="text-sm font-medium text-[var(--ds-text)]">{r.label}</p>
                      <p className="mt-0.5 text-xs text-[var(--ds-text-3)]">
                        {r.avg === null ? `No scored ${r.label.toLowerCase()} in this period` : `${r.count} ${r.count === 1 ? 'call' : 'calls'}${r.delta !== null ? ` · ${r.delta > 0 ? '+' : ''}${r.delta} vs previous ${range} days` : ' · no previous period to compare'}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {strongest?.key === r.key && <Badge tone="info">Strongest</Badge>}
                      {weakest?.key === r.key && <Badge tone="warn">Weakest</Badge>}
                      {r.avg !== null && rag && <Badge tone={RAG_META[rag].tone}>{r.avg}</Badge>}
                    </div>
                  </li>
                )
              })}
            </ul>
            <div className="border-t border-[var(--ds-border)] px-4 py-4 sm:px-5">
              <h3 className="text-xs font-medium text-[var(--ds-text-3)]">What to work on next</h3>
              {weakest ? (
                <>
                  <p className="mt-1 text-sm text-[var(--ds-text)]">
                    {weakest.label} is your lowest-scoring skill ({weakest.avg}) over the last {range} days.
                  </p>
                  {drill && <p className="mt-1 text-xs text-[var(--ds-text-3)]">Suggested drill, rule-based from your latest call: {drill}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {replay ? (
                      <>
                        <Link href={`/calls/${encodeURIComponent(String(replay.call_id))}`} className={dsButton('primary', 'sm')}>
                          Review a recent call{typeof replay.score === 'number' ? ` (scored ${Math.round(replay.score)})` : ''}
                        </Link>
                        <Link href="/call-library?tab=sparring" className={dsButton('secondary', 'sm')}>Practise in Sparring</Link>
                      </>
                    ) : (
                      <Link href="/call-library?tab=sparring" className={dsButton('primary', 'sm')}>Practise in Sparring</Link>
                    )}
                    {open > 0 && <Link href="/assignments" className={dsButton('quiet', 'sm')}>Your assignments ({open} open)</Link>}
                  </div>
                </>
              ) : (
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <p className="text-sm text-[var(--ds-text-2)]">A focus appears once two or more skills have scored calls in this period.</p>
                  <Link href="/call-library?tab=sparring" className={dsButton('secondary', 'sm')}>Practise</Link>
                </div>
              )}
            </div>
          </>
        )}
      </Panel>

      <Panel>
        <PanelHeader title="Recently completed" action={items.length > 0 ? <Link href="/assignments?view=completed" className={dsButton('quiet', 'sm')}>All completed</Link> : undefined} />
        {p.assignments.error ? (
          <Unavailable what="Your assignments" onRetry={p.onRetry} />
        ) : done.length === 0 ? (
          <Quiet>{hasAnyHistory ? 'Nothing completed yet. Finished assignments appear here.' : 'Nothing completed yet. Your finished coaching work will appear here.'}</Quiet>
        ) : (
          <ul aria-label="Recently completed" className="divide-y divide-[var(--ds-border)]">
            {done.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate text-sm font-medium text-[var(--ds-text)]">{d.title}</p>
                  <p className="mt-0.5 truncate text-xs text-[var(--ds-text-3)]">{d.type}{d.evidence ? ` · ${d.evidence}` : ''}</p>
                </div>
                <span className="text-xs tabular-nums text-[var(--ds-text-3)]">{fmtDate(d.completedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel>
        <PanelHeader title="Practice and consistency" />
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-4 sm:px-6">
          <div>
            <dt className="text-xs text-[var(--ds-text-3)]">Completed, 7 / 30 days</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-[var(--ds-text)]">{p.assignments.error ? '—' : `${counts.d7} / ${counts.d30}`}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ds-text-3)]">Streak</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-[var(--ds-text)]">{streak === null ? '—' : `${streak} ${streak === 1 ? 'day' : 'days'}`}</dd>
            <dd className="text-[11px] text-[var(--ds-text-3)]">consecutive days with a completed assignment</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ds-text-3)]">Points</dt>
            <dd className="mt-0.5 text-lg font-semibold tabular-nums text-[var(--ds-text)]">{p.xp.data ? p.xp.data.total.toLocaleString('en-GB') : '—'}</dd>
            <dd className="text-[11px] text-[var(--ds-text-3)]">{p.xp.data ? `${typeof p.xp.data.today === 'number' && p.xp.data.today > 0 ? `+${p.xp.data.today} today · ` : ''}from your account` : p.xp.error ? 'unavailable right now' : ''}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--ds-text-3)]">Level</dt>
            <dd className="mt-0.5 text-lg font-semibold text-[var(--ds-text)]">{level ? level.rank : '—'}</dd>
            <dd className="text-[11px] text-[var(--ds-text-3)]">{level ? `calculated from points: ${100 - level.pct} to next` : ''}</dd>
          </div>
        </dl>
      </Panel>
    </div>
  )
}
