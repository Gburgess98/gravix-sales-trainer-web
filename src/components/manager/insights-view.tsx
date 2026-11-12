'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, GlassCard, Panel, PanelHeader, Segmented, dsButton, dsField } from '@/components/ds'
import {
  BAND_LABEL,
  PERIODS,
  bandOf,
  callsLabel,
  fmtDate,
  kpisFor,
  periodLabel,
  summariseTrend,
  trendShape,
  type Centre,
  type Period,
  type Section,
  type Thresholds,
  type TrendPoint,
} from '@/lib/insights-command'

/* Manager Insights command centre (glass system). Presentational: the page owns fetching and the URL state.
   Hierarchy: controls + data window → four KPIs → score trend with threshold gauge → who needs attention and which skills are
   weak → coaching follow-through. Every figure is real or explicitly unavailable; nothing is defaulted to zero. */

// Recharts writes SVG presentation attributes, so CSS variables can't be used — hex values mirror the glass tokens.
const CHART_LINE = '#60a5fa'
const CHART_GRID = 'rgba(148,163,184,0.14)'
const CHART_TICK = { fill: '#8b97ab', fontSize: 12 }

export type RepOption = { id: string; label: string }
export type ActivityRow = { id: string; label: string; created: number; completed: number }

type Props = {
  period: Period
  onPeriod: (p: Period) => void
  rep: string
  repOptions: RepOption[]
  onRep: (id: string) => void
  repLabel: string | null
  trend: Section<TrendPoint[]>
  centre: Section<Centre>
  thresholds: Section<Thresholds>
  activity: Section<ActivityRow[]>
  nameOf: (repId: string, apiName: string | null) => string
  onRetry: () => void
  onExportCsv: () => void
  onExportPng: () => void
  onExportActivity: () => void
}

const UNAVAILABLE = 'Unavailable'

/* ───────────────────────── shared bits ───────────────────────── */

function Skeleton({ h = 'h-24' }: { h?: string }) {
  return <div role="status" aria-label="Loading" className={`${h} animate-pulse rounded-lg bg-white/[0.05] motion-reduce:animate-none`} />
}

/** One calm explanation per cause inside a card. Permission has no retry: retrying a refusal never helps. */
function SectionNote({ status, what, onRetry }: { status: Exclude<Section<unknown>['status'], 'ok' | 'loading'>; what: string; onRetry: () => void }) {
  if (status === 'permission') {
    return (
      <div role="status" data-state="permission" className="px-5 py-8 text-center">
        <p className="text-sm font-medium text-[var(--ds-text)]">You don’t have access to {what}</p>
        <p className="mx-auto mt-1.5 max-w-xs text-sm text-[var(--ds-text-3)]">Organisation-wide figures need a manager role. Ask an admin to check your role if you need them.</p>
      </div>
    )
  }
  if (status === 'unauthenticated') {
    return (
      <div role="status" data-state="unauthenticated" className="px-5 py-8 text-center">
        <p className="text-sm font-medium text-[var(--ds-text)]">Your session has ended</p>
        <div className="mt-4 flex justify-center"><Link href="/login" className={dsButton('primary', 'sm')}>Sign in</Link></div>
      </div>
    )
  }
  return (
    <div role="alert" data-state="error" className="px-5 py-8 text-center">
      <p className="text-sm font-medium text-red-200">Couldn’t load {what}</p>
      <p className="mx-auto mt-1.5 max-w-xs text-sm text-[var(--ds-text-3)]">This is a problem loading the data, not an empty result.</p>
      <div className="mt-4 flex justify-center"><button type="button" onClick={onRetry} className={dsButton('secondary', 'sm')}>Try again</button></div>
    </div>
  )
}

function Kpi({ label, value, note, children }: { label: string; value?: ReactNode; note?: ReactNode; children?: ReactNode }) {
  return (
    <GlassCard as="div" className="!p-4">
      <p className="text-xs font-medium text-[var(--ds-text-3)]">{label}</p>
      {children ?? <div className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-[var(--ds-text)]">{value}</div>}
      {note && <p className="mt-1 text-xs leading-snug text-[var(--ds-text-3)]">{note}</p>}
    </GlassCard>
  )
}

const dash = <span aria-label="Unavailable" className="text-[var(--ds-text-3)]">—</span>

/* ───────────────────────── score trend ───────────────────────── */

function TrendTip({ active, payload }: { active?: boolean; payload?: Array<{ payload: TrendPoint }> }) {
  const p = active && payload?.[0]?.payload
  if (!p) return null
  return (
    <div className="rounded-lg border border-[var(--ds-border-strong)] bg-[#0d1422] px-3 py-2 text-xs text-[var(--ds-text)] shadow-lg">
      <p className="font-medium">{fmtDate(p.date)}</p>
      <p className="mt-0.5 tabular-nums">Average {Math.round(p.avg)} · {callsLabel(p.count)}</p>
    </div>
  )
}

function TrendCard({ props }: { props: Props }) {
  const { trend, thresholds, period, repLabel } = props
  const points = trend.data ?? []
  const shape = trendShape(points)
  const t = summariseTrend(points)
  const th = thresholds.status === 'ok' ? thresholds.data : null
  return (
    <Panel className="min-w-0">
      <PanelHeader
        title="Score trend"
        meta={`${repLabel ?? 'Team'} · ${periodLabel(period)}`}
        action={
          shape === 'series' ? (
            <div className="flex gap-1">
              <button type="button" className={dsButton('quiet', 'sm')} onClick={props.onExportCsv}>Export CSV</button>
              <button type="button" className={dsButton('quiet', 'sm')} onClick={props.onExportPng}>Export PNG</button>
            </div>
          ) : undefined
        }
      />
      <div className="px-4 pb-4 pt-3 sm:px-5">
        {trend.status === 'loading' ? (
          <Skeleton h="h-56" />
        ) : trend.status !== 'ok' ? (
          <SectionNote status={trend.status} what="the score trend" onRetry={props.onRetry} />
        ) : shape === 'empty' ? (
          <div data-state="empty" className="px-2 py-8 text-center">
            <p className="text-sm font-medium text-[var(--ds-text)]">No scored calls in the {periodLabel(period)}</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-[var(--ds-text-3)]">There is nothing to chart. This doesn’t mean performance is good or bad — only that no call was scored in this window.</p>
            {period < 365 && <div className="mt-4 flex justify-center"><button type="button" onClick={() => props.onPeriod(365)} className={dsButton('secondary', 'sm')}>Show 365 days</button></div>}
          </div>
        ) : shape === 'single' ? (
          <div data-state="single" className="rounded-[var(--ds-radius-control)] border border-[var(--ds-border)] bg-white/[0.02] px-4 py-5">
            <p className="text-3xl font-semibold tabular-nums text-[var(--ds-text)]">{Math.round(points[0].avg)}</p>
            <p className="mt-1 text-sm text-[var(--ds-text-2)]">Average score on {fmtDate(points[0].date)} · {callsLabel(points[0].count)}</p>
            <p className="mt-2 text-xs text-[var(--ds-text-3)]">Only one day has scored calls in this window, so there is no trend to draw yet. A line needs at least two scored days.</p>
          </div>
        ) : (
          <>
            <div id="score-trend-chart" className="min-w-0" role="img" aria-label={`Score trend: ${points.length} scored days, from ${fmtDate(points[0].date)} to ${fmtDate(t.lastDate)}.`}>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={points} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke={CHART_GRID} vertical={false} />
                  <XAxis dataKey="date" tick={CHART_TICK} axisLine={false} tickLine={false} tickMargin={8} minTickGap={32} tickFormatter={(d: string) => fmtDate(d)?.replace(/ \d{4}$/, '') ?? d} />
                  <YAxis domain={[0, 100]} tick={CHART_TICK} axisLine={false} tickLine={false} />
                  <Tooltip content={<TrendTip />} cursor={{ stroke: 'rgba(148,163,184,0.3)' }} />
                  {th && <ReferenceLine y={th.low} stroke="rgba(252,211,77,0.5)" strokeDasharray="4 4" label={{ value: `Low ${th.low}`, fill: '#8b97ab', fontSize: 11, position: 'insideTopRight' }} />}
                  {th && <ReferenceLine y={th.critical} stroke="rgba(248,113,113,0.5)" strokeDasharray="4 4" label={{ value: `Critical ${th.critical}`, fill: '#8b97ab', fontSize: 11, position: 'insideTopRight' }} />}
                  <Line type="monotone" dataKey="avg" name="Average score" stroke={CHART_LINE} strokeWidth={2} dot={{ r: 2.5, fill: CHART_LINE, strokeWidth: 0 }} activeDot={{ r: 4 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-[var(--ds-text-3)]">Each point is one day’s average over the calls scored that day; hover or focus a point for its sample size.</p>
            <details className="mt-3">
              <summary className="ds-focus cursor-pointer rounded text-sm text-[var(--ds-text-2)] hover:text-[var(--ds-text)]">View as table</summary>
              <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-[var(--ds-border)]">
                <table className="w-full text-left text-xs">
                  <caption className="sr-only">Daily average score and number of scored calls</caption>
                  <thead className="sticky top-0 bg-[var(--ds-panel-raised)] text-[var(--ds-text-3)]"><tr><th scope="col" className="px-3 py-2 font-medium">Date</th><th scope="col" className="px-3 py-2 font-medium">Average</th><th scope="col" className="px-3 py-2 font-medium">Scored calls</th></tr></thead>
                  <tbody className="divide-y divide-[var(--ds-border)] tabular-nums text-[var(--ds-text-2)]">
                    {points.map((p) => (<tr key={p.date}><td className="px-3 py-1.5">{fmtDate(p.date)}</td><td className="px-3 py-1.5">{Math.round(p.avg)}</td><td className="px-3 py-1.5">{p.count ?? '—'}</td></tr>))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
      </div>
    </Panel>
  )
}

/* ───────────────────────── threshold gauge ───────────────────────── */

function GaugeCard({ average, thresholds, onRetry }: { average: number | null; thresholds: Section<Thresholds>; onRetry: () => void }) {
  const th = thresholds.status === 'ok' ? thresholds.data : null
  const band = bandOf(average, th)
  const pos = (n: number) => `${Math.min(100, Math.max(0, n))}%`
  return (
    <Panel className="min-w-0">
      <PanelHeader title="Against your thresholds" />
      <div className="px-4 pb-4 pt-3 sm:px-5">
        {thresholds.status === 'loading' ? (
          <Skeleton h="h-24" />
        ) : !th ? (
          thresholds.status === 'permission' || thresholds.status === 'unauthenticated' || thresholds.status === 'error' ? (
            <SectionNote status={thresholds.status} what="score thresholds" onRetry={onRetry} />
          ) : (
            <p data-state="unavailable" className="py-6 text-center text-sm text-[var(--ds-text-3)]">Score thresholds aren’t configured, so there is nothing to compare against.</p>
          )
        ) : (
          <>
            <div
              role="img"
              aria-label={average === null ? `No average to place. Low threshold ${th.low}, critical threshold ${th.critical}.` : `Average ${average} out of 100. Low threshold ${th.low}, critical threshold ${th.critical}.`}
              className="relative pt-5"
            >
              <div className="flex h-3 overflow-hidden rounded-full">
                <div style={{ width: pos(th.critical) }} className="bg-red-400/35" />
                <div style={{ width: pos(th.low - th.critical) }} className="bg-amber-300/35" />
                <div style={{ width: pos(100 - th.low) }} className="bg-sky-300/25" />
              </div>
              {average !== null && (
                <div data-testid="gauge-marker" style={{ left: pos(average) }} className="absolute top-0 -translate-x-1/2">
                  <span className="block rounded bg-white/90 px-1.5 text-xs font-semibold tabular-nums text-slate-900">{average}</span>
                  <span className="mx-auto block h-5 w-0.5 bg-white/90" />
                </div>
              )}
              <div className="relative mt-1 h-4 text-[11px] tabular-nums text-[var(--ds-text-3)]">
                <span className="absolute left-0">0</span>
                <span style={{ left: pos(th.critical) }} className="absolute -translate-x-1/2">{th.critical}</span>
                <span style={{ left: pos(th.low) }} className="absolute -translate-x-1/2">{th.low}</span>
                <span className="absolute right-0">100</span>
              </div>
            </div>
            <p className="mt-3 text-sm text-[var(--ds-text)]" data-testid="gauge-verdict">
              {band ? BAND_LABEL[band] : 'No average to place'}
            </p>
            <p className="mt-1 text-xs text-[var(--ds-text-3)]">
              Low threshold {th.low} · Critical threshold {th.critical}. These are the values set in your admin settings; Gravix doesn’t add a target of its own.
            </p>
          </>
        )}
      </div>
    </Panel>
  )
}

/* ───────────────────────── attention + skills ───────────────────────── */

const LEVEL: Record<'red' | 'amber', { label: string; tone: 'bad' | 'warn' }> = { red: { label: 'Needs attention', tone: 'bad' }, amber: { label: 'Watch', tone: 'warn' } }

function AttentionCard({ props, scoredCalls }: { props: Props; scoredCalls: number | null }) {
  const { centre } = props
  const list = centre.data?.repsNeedingAttention ?? []
  return (
    <Panel className="min-w-0">
      <PanelHeader title="Reps needing attention" meta="Team-wide" />
      {centre.status === 'loading' ? (
        <div className="p-4"><Skeleton h="h-32" /></div>
      ) : centre.status !== 'ok' ? (
        <SectionNote status={centre.status} what="rep performance" onRetry={props.onRetry} />
      ) : list.length === 0 ? (
        <div data-state="empty" className="px-5 py-8 text-center">
          <p className="text-sm font-medium text-[var(--ds-text)]">{scoredCalls === 0 ? 'No scored calls, so reps can’t be assessed' : 'No reps are flagged in this period'}</p>
          <p className="mx-auto mt-1.5 max-w-xs text-sm text-[var(--ds-text-3)]">{scoredCalls === 0 ? 'Flags are based on scored calls and overdue coaching. Widen the period to include more calls.' : 'Flags come from average score, calls scored below 50, and overdue coaching.'}</p>
        </div>
      ) : (
        <ul aria-label="Reps needing attention" className="divide-y divide-[var(--ds-border)]">
          {list.map((r) => (
            <li key={r.repId} className="px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <Link href={`/crm/reps/${encodeURIComponent(r.repId)}`} className="ds-focus min-w-0 truncate rounded text-sm font-medium text-[var(--ds-text)] hover:underline">{props.nameOf(r.repId, r.repName)}</Link>
                <div className="flex items-center gap-2">
                  {r.averageScore !== null && <span className="text-xs tabular-nums text-[var(--ds-text-3)]">Avg {r.averageScore}</span>}
                  <Badge tone={LEVEL[r.level].tone}>{LEVEL[r.level].label}</Badge>
                </div>
              </div>
              <p className="mt-1 text-sm text-[var(--ds-text-2)]">{r.reason}</p>
              {r.action && <p className="mt-0.5 text-xs text-[var(--ds-text-3)]">Suggested: {r.action}</p>}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

const TREND_BADGE = { up: { tone: 'good', glyph: '▲', label: 'Improving' }, down: { tone: 'warn', glyph: '▼', label: 'Declining' }, flat: { tone: 'neutral', glyph: '–', label: 'Steady' }, new: { tone: 'info', glyph: '●', label: 'New' } } as const

function SkillsCard({ props }: { props: Props }) {
  const { centre } = props
  const list = centre.data?.weakestSkills ?? []
  return (
    <Panel className="min-w-0">
      <PanelHeader title="Weakest skills" meta="Team-wide" />
      {centre.status === 'loading' ? (
        <div className="p-4"><Skeleton h="h-32" /></div>
      ) : centre.status !== 'ok' ? (
        <SectionNote status={centre.status} what="skill breakdown" onRetry={props.onRetry} />
      ) : list.length === 0 ? (
        <div data-state="empty" className="px-5 py-8 text-center">
          <p className="text-sm font-medium text-[var(--ds-text)]">No stage scores to break down</p>
          <p className="mx-auto mt-1.5 max-w-xs text-sm text-[var(--ds-text-3)]">Skill scores exist only on calls scored by stage. None were found in this period.</p>
        </div>
      ) : (
        <>
          <ul aria-label="Weakest skills" className="divide-y divide-[var(--ds-border)]">
            {list.map((s) => {
              const b = s.trend ? TREND_BADGE[s.trend] : null
              return (
                <li key={s.skill} className="px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="min-w-0 truncate text-sm font-medium text-[var(--ds-text)]">{s.skill}</span>
                    <div className="flex items-center gap-2">
                      {s.averageScore !== null && <span className="text-sm tabular-nums text-[var(--ds-text)]">{s.averageScore}</span>}
                      {b && <Badge tone={b.tone}>{b.glyph} {b.label}</Badge>}
                    </div>
                  </div>
                  {s.averageScore !== null && (
                    <div aria-hidden className="mt-1.5 h-1.5 rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-[var(--ds-primary)]" style={{ width: `${Math.min(100, Math.max(0, s.averageScore))}%` }} /></div>
                  )}
                  <p className="mt-1 text-xs text-[var(--ds-text-3)]">
                    {s.weakCalls !== null ? `${s.weakCalls} ${s.weakCalls === 1 ? 'call' : 'calls'} scored weak` : 'Weak-call count not reported'}
                    {s.trendLabel ? ` · ${s.trendLabel}` : ''}
                  </p>
                </li>
              )
            })}
          </ul>
          <p className="border-t border-[var(--ds-border)] px-4 py-3 text-xs text-[var(--ds-text-3)] sm:px-5">
            Averages cover calls with stage scores in the period; that is usually fewer than all scored calls. Trends compare with the previous period of the same length.
          </p>
        </>
      )}
    </Panel>
  )
}

/* ───────────────────────── coaching follow-through ───────────────────────── */

function FollowThrough({ props }: { props: Props }) {
  const { centre, activity } = props
  const c = centre.data
  const rows = activity.data ?? []
  const stat = (label: string, v: number | null, hint: string, tone?: 'bad') => (
    <div className="min-w-0">
      <dt className="text-xs text-[var(--ds-text-3)]">{label}</dt>
      <dd className={`mt-0.5 text-2xl font-semibold tabular-nums ${tone === 'bad' && (v ?? 0) > 0 ? 'text-red-200' : 'text-[var(--ds-text)]'}`}>{v === null ? dash : v}</dd>
      <p className="mt-0.5 text-xs text-[var(--ds-text-3)]">{hint}</p>
    </div>
  )
  return (
    <Panel className="min-w-0">
      <PanelHeader title="Coaching follow-through" meta="Team-wide" />
      {centre.status === 'loading' ? (
        <div className="p-4"><Skeleton h="h-24" /></div>
      ) : centre.status !== 'ok' ? (
        <SectionNote status={centre.status} what="coaching figures" onRetry={props.onRetry} />
      ) : (
        <div className="px-4 py-4 sm:px-5">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {stat('Completed', c?.completedAssignments ?? null, `In the ${periodLabel(props.period)}`)}
            {stat('Open', c?.openAssignments ?? null, 'Unfinished right now, overdue included')}
            {stat('Overdue', c?.overdueAssignments ?? null, 'Past their due date right now', 'bad')}
          </dl>
          <p className="mt-3 text-xs text-[var(--ds-text-3)]">Completed counts the selected period; open and overdue are a snapshot of today. They are shown side by side, not combined into a rate.</p>
          {activity.status === 'ok' && rows.length > 0 && (
            <>
              <h3 className="mt-5 text-sm font-medium text-[var(--ds-text)]">CRM coaching tasks by rep</h3>
              <ul aria-label="CRM coaching tasks by rep" className="mt-2 space-y-3">
                {rows.slice(0, 5).map((r) => (
                  <li key={r.id}>
                    <div className="flex items-baseline justify-between gap-3 text-sm"><span className="truncate text-[var(--ds-text)]">{r.label}</span><span className="shrink-0 text-xs tabular-nums text-[var(--ds-text-3)]">{r.completed}/{r.created} done</span></div>
                    <div aria-hidden className="mt-1 h-1.5 rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-[var(--ds-primary)]" style={{ width: `${r.created > 0 ? Math.min(100, Math.round((r.completed / r.created) * 100)) : 0}%` }} /></div>
                  </li>
                ))}
              </ul>
              {rows.length > 5 && (
                <details className="mt-3">
                  <summary className="ds-focus cursor-pointer rounded text-sm text-[var(--ds-text-2)] hover:text-[var(--ds-text)]">Show {rows.length - 5} more reps</summary>
                  <ul aria-label="More CRM coaching tasks by rep" className="mt-3 space-y-3">
                    {rows.slice(5).map((r) => (
                      <li key={r.id}><div className="flex items-baseline justify-between gap-3 text-sm"><span className="truncate text-[var(--ds-text)]">{r.label}</span><span className="shrink-0 text-xs tabular-nums text-[var(--ds-text-3)]">{r.completed}/{r.created} done</span></div></li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
          {(activity.status === 'error' || activity.status === 'unauthenticated' || activity.status === 'permission') && (
            <p role="status" data-state="partial" className="mt-4 text-xs text-amber-100">CRM coaching tasks by rep couldn’t be loaded. The figures above are unaffected.</p>
          )}
        </div>
      )}
    </Panel>
  )
}

/* ───────────────────────── page body ───────────────────────── */

export function InsightsView(props: Props) {
  const { period, rep, repOptions, centre, trend, thresholds, activity, repLabel } = props
  const scope = rep === 'all' ? 'team' : 'rep'
  const points = trend.data ?? []
  const t = summariseTrend(points)
  const kpis = kpisFor(scope, centre.status === 'ok' ? centre.data : null, trend.status === 'ok' ? points : [])
  const scored = trend.status === 'ok' || centre.status === 'ok' ? kpis.scoredCalls : null
  const who = scope === 'rep' ? repLabel ?? 'This rep' : 'Team'

  // A permission refusal has its own calm state inside the section; "failed" is for real load failures only.
  const isFail = (st: Section<unknown>['status']) => st === 'error' || st === 'unauthenticated'
  const failed = [
    isFail(trend.status) ? 'score trend' : null,
    isFail(centre.status) ? 'team figures' : null,
    isFail(thresholds.status) ? 'thresholds' : null,
    isFail(activity.status) ? 'CRM coaching tasks' : null,
  ].filter(Boolean) as string[]

  const windowLine =
    trend.status === 'loading' ? 'Loading…'
    : trend.status !== 'ok' ? 'Data window unavailable'
    : points.length === 0 ? `No scored calls in the ${periodLabel(period)}`
    : `Last scored call: ${fmtDate(t.lastDate)} · ${t.scoredCalls === null ? 'sample size not reported' : `${t.scoredCalls} scored ${t.scoredCalls === 1 ? 'call' : 'calls'}`} in the ${periodLabel(period)}`

  return (
    <div className="space-y-5">
      <GlassCard as="div" className="!p-3 sm:!p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select aria-label="Filter by rep" className={`${dsField} sm:w-56`} value={rep} onChange={(e) => props.onRep(e.target.value)}>
              <option value="all">All reps</option>
              {repOptions.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
            <Segmented
              label="Period"
              value={String(period) as '30' | '90' | '365'}
              onChange={(v) => props.onPeriod(Number(v) as Period)}
              options={PERIODS.map((p) => ({ value: String(p) as '30' | '90' | '365', label: `${p} days` }))}
            />
          </div>
          <p role="status" aria-live="polite" data-testid="data-window" className="text-sm text-[var(--ds-text-2)]">{windowLine}</p>
        </div>
        {scope === 'rep' && <p className="mt-2 text-xs text-[var(--ds-text-3)]">Filtered to {who}: average, scored calls and the trend are theirs. Review, coaching, attention and skills stay team-wide.</p>}
      </GlassCard>

      {failed.length > 0 && (
        <div role="status" data-testid="partial-failure" className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--ds-radius-control)] border border-amber-300/25 bg-amber-300/[0.06] px-4 py-2.5 text-sm text-amber-100">
          <span>Some figures couldn’t be loaded: {failed.join(', ')}. The rest of this page is unaffected.</span>
          <button type="button" onClick={props.onRetry} className={dsButton('quiet', 'sm')}>Try again</button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
        <Kpi
          label="Average score"
          value={trend.status === 'loading' && centre.status === 'loading' ? <Skeleton h="h-9" /> : kpis.averageScore !== null ? kpis.averageScore : dash}
          note={kpis.averageScore !== null ? `${who} · ${callsLabel(kpis.scoredCalls)}` : centre.status === 'loading' ? undefined : centre.status !== 'ok' && scope === 'team' ? UNAVAILABLE : kpis.averageNote}
        />
        <Kpi
          label="Scored calls"
          value={scored === null ? dash : scored}
          note={scored === null ? UNAVAILABLE : `${who} · ${periodLabel(period)}`}
        />
        <Kpi
          label="Calls needing review"
          value={centre.status === 'ok' && centre.data?.callsNeedingReview != null ? centre.data.callsNeedingReview : dash}
          note={centre.status === 'ok' ? <><span>Team-wide · </span><Link href="/coaching?tab=review" className="ds-focus rounded underline-offset-2 hover:underline">Open review queue</Link></> : UNAVAILABLE}
        />
        <Kpi label="Coaching">
          <div className="mt-1 grid grid-cols-2 divide-x divide-[var(--ds-border)]">
            <div className="pr-3"><p className="text-3xl font-semibold tabular-nums tracking-tight text-[var(--ds-text)]">{centre.status === 'ok' && centre.data?.openAssignments != null ? centre.data.openAssignments : dash}</p><p className="text-xs text-[var(--ds-text-3)]">Open</p></div>
            <div className="pl-3"><p className={`text-3xl font-semibold tabular-nums tracking-tight ${(centre.data?.overdueAssignments ?? 0) > 0 ? 'text-red-200' : 'text-[var(--ds-text)]'}`}>{centre.status === 'ok' && centre.data?.overdueAssignments != null ? centre.data.overdueAssignments : dash}</p><p className="text-xs text-[var(--ds-text-3)]">Overdue</p></div>
          </div>
          <p className="mt-1 text-xs leading-snug text-[var(--ds-text-3)]">{centre.status === 'ok' ? 'Team-wide · overdue is part of open' : UNAVAILABLE}</p>
        </Kpi>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="lg:col-span-2"><TrendCard props={props} /></div>
        <GaugeCard average={kpis.averageScore} thresholds={thresholds} onRetry={props.onRetry} />
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <AttentionCard props={props} scoredCalls={centre.status === 'ok' ? centre.data?.scoredCalls ?? null : null} />
        <SkillsCard props={props} />
      </div>

      <FollowThrough props={props} />

      <details className="ds-panel rounded-[var(--ds-radius-card)]">
        <summary className="ds-focus cursor-pointer select-none rounded-[var(--ds-radius-card)] px-5 py-4 text-sm font-medium text-[var(--ds-text)]">Exports and definitions</summary>
        <div className="space-y-4 border-t border-[var(--ds-border)] px-5 py-5 text-sm text-[var(--ds-text-2)]">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={dsButton('secondary', 'sm')} disabled={!points.length} onClick={props.onExportCsv}>Export score trend (CSV)</button>
            <button type="button" className={dsButton('secondary', 'sm')} disabled={activity.status !== 'ok' || !(activity.data ?? []).length} onClick={props.onExportActivity}>Export CRM coaching tasks by rep (CSV)</button>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--ds-text-3)]">
            <li>Average score and scored calls count only calls that have a score. Unscored calls are excluded, never counted as zero.</li>
            <li>The trend shows each day’s average and its sample size. The average KPI is weighted by calls.</li>
            <li>Review, coaching, attention and skills come from the team command centre and ignore the rep filter.</li>
            <li>Thresholds are read from your admin settings. Gravix doesn’t set a target.</li>
            <li>This page doesn’t report revenue, pipeline, call length, flags or points.</li>
          </ul>
          <nav aria-label="Next steps" className="flex flex-wrap gap-2">
            <Link href="/coaching?tab=review" className={dsButton('secondary', 'sm')}>Open review queue</Link>
            <Link href="/coaching?tab=assignments" className={dsButton('secondary', 'sm')}>Review assignments</Link>
            <Link href="/upload" className={dsButton('quiet', 'sm')}>Upload a call</Link>
          </nav>
        </div>
      </details>
    </div>
  )
}
