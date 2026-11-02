'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { proxyFetch } from '@/lib/api'
import { StatCard } from '@/components/ui/stat-card'
import { AiInsightCard, AiInsightItem } from '@/components/ui/ai-insight-card'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingText } from '@/components/ui/loading-skeleton'
import { PageContainer } from '@/components/layout/page-container'
import { SectionCard } from '@/components/ui/section-card'
import { Disclosure } from '@/components/ui/disclosure'
import { PageHeader } from '@/components/layout/page-header'
import { buttonClasses } from '@/components/ui/button'
import {
  TIER_COLORS,
  trendDelta,
  trendDirection,
  xpLevel,
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
  const [loading, setLoading] = useState(true)
  const [hasAnyData, setHasAnyData] = useState(false)

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    try {
      const [meRes, assignRes, trendRes] = await Promise.allSettled([
        proxyFetch('/v1/reps/me', { cache: 'no-store' }),
        proxyFetch('/v1/assignments', { cache: 'no-store' }),
        proxyFetch('/v1/dashboard/voice-score-trend?days=30', { cache: 'no-store' }),
      ])

      let repId: string | null = null

      if (meRes.status === 'fulfilled') {
        const d = await meRes.value.json().catch(() => null)
        if (d?.ok && d?.me) { setMe(d.me); repId = d.me.id ?? null; setHasAnyData(true) }
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
  const totalXp = useMemo(() => Number(me?.xp_total ?? 0), [me])
  const xpInfo = useMemo(() => xpLevel(totalXp), [totalXp])
  const tierKey = String(me?.tier ?? '').toLowerCase()

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
      <PageContainer>
        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Dashboard</p>
          <h1 className="mt-0.5 text-xl font-semibold text-white">My Dashboard</h1>
        </div>
        <LoadingText text="Loading your coaching data…" />
      </PageContainer>
    )
  }

  // ── Always render the full dashboard ────────────────────────────────────────
  // When hasAnyData is false the onboarding section renders first,
  // then all coaching sections render in placeholder state so users and
  // demo clients can see the full platform layout.

  // Day 45 — everything below is derived from the same real data as before; nothing
  // here is invented. "Needs attention" only lists signals the API already returned.
  const attention: { tone: 'danger' | 'warning'; text: string; href?: string }[] = []
  if ((summary?.overdue_count ?? 0) > 0) {
    attention.push({
      tone: 'danger',
      text: `${summary!.overdue_count} overdue assignment${summary!.overdue_count === 1 ? '' : 's'}`,
      href: '/assignments',
    })
  }
  if (briefing.urgency === 'high') attention.push({ tone: 'warning', text: 'Coaching urgency is high' })
  if (briefing.weakestArea && briefing.weakestScore !== null && briefing.weakestScore < 60) {
    attention.push({ tone: 'warning', text: `${briefing.weakestArea} needs attention (score ${Math.round(briefing.weakestScore)})` })
  }
  for (const w of feed?.regression_warnings ?? []) attention.push({ tone: 'warning', text: w })

  const replayId = feed?.recommended_replay?.call_id ?? null
  const greeting = me?.name ? `Good day, ${me.name.split(' ')[0]}` : 'My Dashboard'
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })

  return (
    <PageContainer>

      {/* ── Header: where am I ── */}
      <PageHeader
        glass
        eyebrow="Dashboard"
        title={greeting}
        subtitle={`AI coaching briefing · ${today}`}
        actions={
          <>
            {xpInfo.rank && (
              <span className="rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs font-semibold text-neutral-300">
                {xpInfo.rank}
              </span>
            )}
            {me?.tier && (
              <span className={`rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs font-semibold ${TIER_COLORS[tierKey] ?? 'text-neutral-300'}`}>
                {me.tier}
              </span>
            )}
          </>
        }
      />

      {/* ── Getting Started (onboarding) — visible only when no data yet ── */}
      {!hasAnyData && (
        <div className="space-y-3">
          <AiInsightCard
            type="summary"
            label="Getting Started"
            content="Your AI coaching dashboard is ready. Upload a call, complete an assignment, or run a sparring session to activate your personalised insights below."
          />
          <div className="grid gap-3 md:grid-cols-3">
            <Link href="/upload" className="group rounded-xl border border-neutral-800 bg-neutral-950 p-4 transition-all hover:border-indigo-500/40 hover:bg-neutral-900/70">
              <div className="text-sm font-semibold text-white group-hover:text-indigo-200 transition-colors">Upload Your First Call</div>
              <div className="mt-0.5 text-xs text-neutral-500">Get AI-scored feedback on your technique.</div>
            </Link>
            <Link href="/call-library?tab=sparring" className="group rounded-xl border border-neutral-800 bg-neutral-950 p-4 transition-all hover:border-indigo-500/40 hover:bg-neutral-900/70">
              <div className="text-sm font-semibold text-white group-hover:text-indigo-200 transition-colors">Run a Sparring Session</div>
              <div className="mt-0.5 text-xs text-neutral-500">Practice objection handling with AI personas.</div>
            </Link>
            <Link href="/assignments" className="group rounded-xl border border-neutral-800 bg-neutral-950 p-4 transition-all hover:border-indigo-500/40 hover:bg-neutral-900/70">
              <div className="text-sm font-semibold text-white group-hover:text-indigo-200 transition-colors">Complete an Assignment</div>
              <div className="mt-0.5 text-xs text-neutral-500">Work through your coach&apos;s recommended drills.</div>
            </Link>
          </div>
        </div>
      )}

      {/* ── 1. What should I do next? One primary action. ── */}
      {hasAnyData && (
        <SectionCard variant="ai" glass eyebrow="Next Best Action" padded>
          {mission ? (
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 space-y-1.5">
                <h2 className="text-lg font-semibold text-white">{mission.label}</h2>
                <p className="max-w-2xl text-sm text-neutral-400">{mission.detail}</p>
                <p className="text-xs text-neutral-400">
                  Impact: <span className="font-medium text-neutral-300">{mission.impact}</span>
                  <span className="mx-2 text-neutral-700">·</span>
                  Time: <span className="font-medium text-neutral-300">{mission.time}</span>
                </p>
              </div>
              <Link href={mission.href} className={buttonClasses('primary', 'md', 'shrink-0 self-start md:self-auto')}>
                Start now →
              </Link>
            </div>
          ) : (
            <EmptyState
              message="You're clear"
              sub="Upload a call or run a sparring session to generate coaching recommendations."
              action={{ label: 'Upload a call', onClick: () => { window.location.href = '/upload' } }}
            />
          )}
        </SectionCard>
      )}

      {/* ── 2. What needs attention? Only shown when the API returned a signal. ── */}
      {attention.length > 0 && (
        <SectionCard title="Needs attention" padded>
          <ul className="space-y-2">
            {attention.map((a, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm">
                <span
                  aria-hidden
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${a.tone === 'danger' ? 'bg-danger-500' : 'bg-warning-500'}`}
                />
                {a.href ? (
                  <Link href={a.href} className="text-neutral-200 underline-offset-2 hover:underline">{a.text}</Link>
                ) : (
                  <span className="text-neutral-300">{a.text}</span>
                )}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* ── 3. Where do I continue? ── */}
      {hasAnyData && (
      <section aria-label="Continue" className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-[0.1em] text-neutral-500">Continue</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            replayId
              ? { href: `/calls/${encodeURIComponent(replayId)}`, title: 'Review flagged call', sub: 'Recommended by your coach' }
              : { href: '/call-library', title: 'Browse calls', sub: 'Scored conversations' },
            { href: '/assignments', title: 'Assignments', sub: `${openAssignments} open` },
            { href: '/call-library?tab=sparring', title: 'Sparring', sub: 'Practise with an AI buyer' },
            { href: '/upload', title: 'Upload a call', sub: 'Get it scored' },
          ].map((c) => (
            <Link
              key={c.title}
              href={c.href}
              className="group rounded-xl border border-neutral-800 bg-neutral-950 p-4 transition-colors hover:border-neutral-600 hover:bg-neutral-900/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/70"
            >
              <div className="text-sm font-semibold text-white">{c.title}</div>
              <div className="mt-0.5 text-xs text-neutral-500">{c.sub}</div>
            </Link>
          ))}
        </div>
      </section>
      )}

      {/* ── Performance summary: three metrics maximum. Points / streak live under Coaching detail. ── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          glass
          label="Voice Score"
          value={voiceScore ?? '—'}
          subtext={voiceScore === null ? 'after your first scored call' : voiceScore >= 80 ? 'strong · latest avg' : voiceScore >= 60 ? 'steady · latest avg' : 'needs work · latest avg'}
          variant={voiceScore === null ? 'default' : voiceScore >= 80 ? 'success' : voiceScore >= 60 ? 'warning' : 'danger'}
        />
        <StatCard
          glass
          label="Trend"
          value={trend.length === 0 ? '—' : briefing.voiceTrend === 'improving' ? '↑ Improving' : briefing.voiceTrend === 'declining' ? '↓ Declining' : '→ Stable'}
          subtext="voice score, last 30 days"
          valueClass="text-lg text-white"
        />
        <StatCard
          glass
          label="Open Assignments"
          value={openAssignments}
          subtext={summary?.overdue_count ? `${summary.overdue_count} overdue` : 'in queue'}
          variant={summary?.overdue_count ? 'danger' : 'default'}
        />
      </div>

      {/* Progress detail (trend chart, skill breakdown, development level) now lives on /progress. */}
      <div>
        <Link href="/progress" className={buttonClasses('ghost', 'sm')}>
          View full progress →
        </Link>
      </div>

      {/* ── Secondary detail: progressive disclosure (collapsed by default) ── */}
      <Disclosure
        title="Coaching detail"
        hint="AI briefing, recent feedback and development progress"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3">
            <div className="mb-1 text-[11px] uppercase tracking-[0.1em] text-neutral-500">Weakest area</div>
            <div className="text-sm font-semibold text-amber-300">{briefing.weakestArea ?? '—'}</div>
            {briefing.weakestScore !== null && (
              <div className="mt-0.5 text-[11px] text-neutral-600">score {Math.round(briefing.weakestScore)}</div>
            )}
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-3">
            <div className="mb-1 text-[11px] uppercase tracking-[0.1em] text-neutral-500">Strongest area</div>
            {briefing.strongestArea
              ? <div className="text-sm font-semibold text-emerald-300">{briefing.strongestArea}</div>
              : <div className="text-sm text-neutral-600">No coaching data yet</div>}
          </div>
        </div>
        {briefing.motivationMessage && (
          <p className="text-xs italic text-indigo-300/70">&quot;{briefing.motivationMessage}&quot;</p>
        )}
      {/* ── Section 5: Recent AI Feedback ── */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-neutral-400 uppercase tracking-[0.1em]">Recent AI Feedback</div>
        {feed?.coaching_summary
          ? <AiInsightCard type="summary" label="Coaching Summary" content={feed.coaching_summary} />
          : <AiInsightCard type="summary" label="No coaching data yet" content="Your AI feedback will appear here after your first scored call or sparring session. Upload a call to get started." />
        }
        {feed?.regression_warnings?.map((w, i) => (
          <AiInsightItem key={i} content={w} type="flag" />
        ))}
      </div>



      </Disclosure>

    </PageContainer>
  )
}
