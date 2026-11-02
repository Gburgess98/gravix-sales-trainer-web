'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { proxyFetch } from '@/lib/api'
import { PageShell, PageHead, GlassCard, Panel, Metric, Badge, dsButton, DataList, DataRow, SectionTitle, EmptyPanel, LoadingRows } from '@/components/ds'
import { callState, scoreTone, formatCallDate, firstName, greetingFor } from '@/lib/ds-model'
import { formatCallDisplayTitle } from '@/lib/callDisplay'
import {
  trendDelta,
  trendDirection,
  type Assignment,
  type DailyFeed,
  type RepMe,
  type AssignmentSummary,
  type TrendPoint,
} from '@/lib/progress-model'

// ── Chart imports (dynamic — avoid SSR hydration issues) ─────────────────────

// ── Types ─────────────────────────────────────────────────────────────────────

type BriefingData = {
  voiceScore: number | null
  voiceDelta: number | null
  voiceTrend: 'improving' | 'declining' | 'stable'
  strongestArea: string | null
  weakestArea: string | null
  weakestScore: number | null
  openAssignments: number
  overdueAssignments: number
  urgency: 'low' | 'medium' | 'high' | null
  recommendedAction: string | null
  expectedImpact: string | null
  motivationMessage: string | null
}

type RecentCall = {
  id: string
  filename: string | null
  status: string
  created_at: string
  score_overall: number | null
  rep_name?: string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

// ── Helpers ───────────────────────────────────────────────────────────────────

function computeBriefingData(
  me: RepMe | null,
  summary: AssignmentSummary | null,
  trend: TrendPoint[],
  feed: DailyFeed | null,
  assignments: Assignment[],
): BriefingData {
  const voiceScore = trend.length ? Math.round(trend[trend.length - 1]?.voice_score ?? 0) : null
  const voiceDelta = trendDelta(trend)
  const voiceTrend = trendDirection(trend)
  const open = summary?.open_count ?? assignments.filter(a => a.status === 'open' || a.status === 'assigned').length
  const overdue = summary?.overdue_count ?? 0
  const weakestArea = feed?.weakest_area?.category ?? null
  const strongestArea = feed?.strongest_area?.category ?? null
  const weakestScore = feed?.weakest_area?.score ?? null
  const recommendedAction = feed?.recommended_drill ?? summary?.today_focus?.title ?? (open > 0 ? assignments.find(a => a.status === 'open' || a.status === 'assigned')?.title ?? null : null)
  const expectedImpact = weakestArea ? `${weakestArea} improvement` : open > 0 ? 'Coaching compliance' : null

  return {
    voiceScore,
    voiceDelta,
    voiceTrend,
    strongestArea,
    weakestArea,
    weakestScore,
    openAssignments: open,
    overdueAssignments: overdue,
    urgency: feed?.coaching_urgency ?? null,
    recommendedAction,
    expectedImpact,
    motivationMessage: feed?.ai_motivation_message ?? null,
  }
}

function nextAction(
  summary: AssignmentSummary | null,
  assignments: Assignment[],
  feed: DailyFeed | null,
): { label: string; detail: string; impact: string; time: string; href: string } | null {
  const overdue = assignments.find(a => a.due_at && new Date(a.due_at) < new Date() && a.status !== 'completed')
  if (overdue) return { label: overdue.title || 'Complete overdue assignment', detail: 'Past due — completing it keeps your streak and coaching score intact.', impact: 'Coaching compliance', time: '10–20 min', href: '/assignments' }
  if (feed?.recommended_drill) return { label: feed.recommended_drill, detail: feed.coaching_summary || 'Your coach recommends this based on recent call patterns.', impact: feed.weakest_area?.category ? `${feed.weakest_area.category} improvement` : 'Performance improvement', time: '15–25 min', href: '/assignments' }
  const focus = summary?.today_focus
  if (focus) return { label: focus.title || "Today's assignment", detail: "Queued as today's coaching priority.", impact: 'Coaching compliance', time: '10–20 min', href: '/assignments' }
  const topOpen = assignments.find(a => a.status === 'open' || a.status === 'assigned')
  if (topOpen) return { label: topOpen.title || 'Complete open assignment', detail: 'Clear your coaching queue to maintain momentum.', impact: 'Coaching momentum', time: '10–20 min', href: '/assignments' }
  if (feed?.recommended_replay?.call_id) return { label: 'Review flagged call', detail: 'Your coach recommends replaying this call for improvement patterns.', impact: 'Call quality awareness', time: '5–10 min', href: `/calls/${feed.recommended_replay.call_id}` }
  return null
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [me, setMe] = useState<RepMe | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [summary, setSummary] = useState<AssignmentSummary | null>(null)
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [latestAvg, setLatestAvg] = useState<number | null>(null)
  const [feed, setFeed] = useState<DailyFeed | null>(null)
  const [recent, setRecent] = useState<RecentCall[]>([])
  const [loading, setLoading] = useState(true)
  const [hasAnyData, setHasAnyData] = useState(false)

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    try {
      const [meRes, assignRes, trendRes, callsRes] = await Promise.allSettled([
        proxyFetch('/v1/reps/me', { cache: 'no-store' }),
        proxyFetch('/v1/assignments', { cache: 'no-store' }),
        proxyFetch('/v1/dashboard/voice-score-trend?days=30', { cache: 'no-store' }),
        proxyFetch('/v1/calls/paged?limit=4&scope=mine', { cache: 'no-store' }),
      ])

      let repId: string | null = null

      if (meRes.status === 'fulfilled') {
        const d = await meRes.value.json().catch(() => null)
        // /v1/reps/me answers either { ok, me: {...} } or the same fields at the top level
        // (the API has two handlers on this path; the flat one wins). Accept both.
        const meObj = d?.me ?? (d?.ok && d?.id ? d : null)
        if (d?.ok && meObj) { setMe(meObj); repId = meObj.id ?? null; setHasAnyData(true) }
      }
      if (assignRes.status === 'fulfilled') {
        const d = await assignRes.value.json().catch(() => null)
        if (d?.ok) {
          const items: Assignment[] = d.assignments ?? d.items ?? []
          setAssignments(items); setSummary(d.summary ?? null)
          if (items.length > 0) setHasAnyData(true)
        }
      }
      if (trendRes.status === 'fulfilled') {
        const d = await trendRes.value.json().catch(() => null)
        if (d?.ok) {
          setTrend(d.trend ?? []); setLatestAvg(d.latest_avg ?? null)
          if ((d.trend ?? []).length > 0) setHasAnyData(true)
        }
      }

      if (callsRes.status === 'fulfilled') {
        const d = await callsRes.value.json().catch(() => null)
        const items: RecentCall[] = d?.calls ?? d?.items ?? []
        if (d?.ok && items.length > 0) { setRecent(items.slice(0, 4)); setHasAnyData(true) }
      }

      if (repId) {
        try {
          const feedRes = await proxyFetch(`/v1/reps/${encodeURIComponent(repId)}/daily-feed`, { cache: 'no-store' })
          const d = await feedRes.json().catch(() => null)
          if (d && (d.coaching_summary || d.weakest_area || d.recommended_drill)) setFeed(d)
        } catch { /* non-fatal */ }
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadDashboard() }, [loadDashboard])

  // ── Derived values ────────────────────────────────────────────────────────────

  const openAssignments = useMemo(() =>
    summary?.open_count ?? assignments.filter(a => a.status === 'open' || a.status === 'assigned').length
  , [summary, assignments])

  const briefing = useMemo(
    () => computeBriefingData(me, summary, trend, feed, assignments),
    [me, summary, trend, feed, assignments]
  )
  const mission = useMemo(() => nextAction(summary, assignments, feed), [summary, assignments, feed])
  const voiceScore = useMemo(() => {
    if (latestAvg !== null) return Math.round(latestAvg)
    return trend.length > 0 ? Math.round(trend[trend.length - 1]?.voice_score ?? 0) : null
  }, [latestAvg, trend])

  // ── Loading ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageShell>
        <PageHead title="Home" />
        <Panel><LoadingRows rows={4} label="Loading your coaching data" /></Panel>
      </PageShell>
    )
  }

  // Glass pilot — Home answers three questions in order: how am I doing (3 metrics), what should I
  // work on (recommended action + assigned task), what did I do lately (4 recent calls).
  // Everything shown comes from the same API responses as before; nothing is invented.
  const now = new Date()
  const name = firstName(me?.name)
  const greeting = name ? `${greetingFor(now.getHours())}, ${name}` : 'Home'
  const today = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const trendLabel = trend.length === 0 ? '—' : briefing.voiceTrend === 'improving' ? 'Improving' : briefing.voiceTrend === 'declining' ? 'Declining' : 'Steady'
  const trendNote = briefing.voiceDelta !== null && trend.length > 0 ? `${briefing.voiceDelta > 0 ? '+' : ''}${Math.round(briefing.voiceDelta)} pts over 30 days` : 'voice score, 30 days'
  const queue = assignments
    .filter(a => a.status === 'open' || a.status === 'assigned')
    .filter(a => !mission || (a.title ?? '') !== mission.label)
    .slice(0, 3)
  const isOverdue = (a: Assignment) => !!a.due_at && new Date(a.due_at) < now

  return (
    <PageShell>
      <PageHead title={greeting} subtitle={today} />

      {/* ── What is my next action? One recommendation, one button. ── */}
      <GlassCard>
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--ds-highlight)]">Recommended next</p>
        {mission ? (
          <div className="mt-2 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold tracking-tight text-[var(--ds-text)] sm:text-2xl">{mission.label}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--ds-text-2)]">{mission.detail}</p>
              <p className="mt-3 text-xs text-[var(--ds-text-3)]">{mission.impact} · about {mission.time}</p>
            </div>
            <Link href={mission.href} className={dsButton('primary', 'md', 'shrink-0 self-start md:self-auto')}>Start now</Link>
          </div>
        ) : (
          <div className="mt-2 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-[var(--ds-text)] sm:text-2xl">
                {hasAnyData ? "You're all caught up" : 'Upload your first call'}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--ds-text-2)]">
                {hasAnyData
                  ? 'Nothing is waiting on you. Upload a recent call to get new coaching.'
                  : 'Get an AI-scored breakdown of your technique and a personal coaching plan.'}
              </p>
            </div>
            <Link href="/upload" className={dsButton('primary', 'md', 'shrink-0 self-start md:self-auto')}>Upload call</Link>
          </div>
        )}
      </GlassCard>

      {/* ── How am I performing? Three metrics, no more. ── */}
      <section aria-label="Performance" className="grid gap-3 sm:grid-cols-3">
        <Metric
          label="Voice score"
          value={voiceScore ?? '—'}
          note={voiceScore === null ? 'Appears after your first scored call' : voiceScore >= 80 ? 'Strong' : voiceScore >= 60 ? 'Steady' : 'Needs work'}
        />
        <Metric label="Trend" value={trendLabel} note={trendNote} />
        <Metric
          label="Open assignments"
          value={openAssignments}
          note={summary?.overdue_count ? `${summary.overdue_count} overdue` : 'In your queue'}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* ── What did I do lately? ── */}
        <Panel className="lg:col-span-3">
          <div className="border-b border-[var(--ds-border)] px-5 py-4">
            <SectionTitle action={<Link href="/call-library" className="text-sm text-[var(--ds-highlight)] hover:underline">All calls</Link>}>Recent calls</SectionTitle>
          </div>
          {recent.length === 0 ? (
            <EmptyPanel title="No calls yet" body="Your latest scored calls will show up here." action={<Link href="/upload" className={dsButton('secondary', 'sm')}>Upload call</Link>} />
          ) : (
            <DataList label="Recent calls">
              {recent.map((c) => {
                const st = callState(c.status)
                const score = typeof c.score_overall === 'number' ? Math.round(c.score_overall) : null
                return (
                  <DataRow
                    key={c.id}
                    href={`/calls/${encodeURIComponent(c.id)}`}
                    title={formatCallDisplayTitle({ title: c.filename, repName: c.rep_name })}
                    meta={formatCallDate(c.created_at)}
                    trailing={st.kind === 'scored'
                      ? <Badge tone={scoreTone(score)}>{score ?? '—'}</Badge>
                      : <Badge tone={st.tone}>{st.label}</Badge>}
                  />
                )
              })}
            </DataList>
          )}
        </Panel>

        {/* ── What was I assigned? ── */}
        <Panel className="lg:col-span-2">
          <div className="border-b border-[var(--ds-border)] px-5 py-4">
            <SectionTitle action={<Link href="/assignments" className="text-sm text-[var(--ds-highlight)] hover:underline">All</Link>}>Assigned to you</SectionTitle>
          </div>
          {queue.length === 0 ? (
            <EmptyPanel title="Nothing else assigned" body="Coaching tasks from your manager appear here." />
          ) : (
            <DataList label="Assigned coaching">
              {queue.map((a) => (
                <DataRow
                  key={a.id}
                  href="/assignments"
                  title={a.title || 'Coaching task'}
                  meta={a.due_at ? `Due ${formatCallDate(a.due_at)}` : undefined}
                  trailing={isOverdue(a) ? <Badge tone="bad">Overdue</Badge> : undefined}
                />
              ))}
            </DataList>
          )}
        </Panel>
      </div>

      <p className="text-sm">
        <Link href="/progress" className="text-[var(--ds-highlight)] hover:underline">View full progress</Link>
      </p>
    </PageShell>
  )
}
