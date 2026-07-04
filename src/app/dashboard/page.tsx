'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { proxyFetch } from '@/lib/api'
import { StatCard } from '@/components/ui/stat-card'
import { AiInsightCard, AiInsightItem } from '@/components/ui/ai-insight-card'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingText } from '@/components/ui/loading-skeleton'
import { PageContainer } from '@/components/layout/page-container'

// ── Chart imports (dynamic — avoid SSR hydration issues) ─────────────────────
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false })
const LineChart = dynamic(() => import('recharts').then(m => m.LineChart), { ssr: false })
const Line = dynamic(() => import('recharts').then(m => m.Line), { ssr: false })
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false })

// ── Types ─────────────────────────────────────────────────────────────────────

type RepMe = {
  id: string
  name?: string | null
  tier?: string | null
  xp_total?: number | null
  xp_today?: number | null
}

type Assignment = {
  id: string
  title?: string | null
  type?: string | null
  status: 'open' | 'assigned' | 'completed' | string
  due_at?: string | null
  completed_at?: string | null
  created_at?: string | null
  meta?: Record<string, any> | null
}

type AssignmentSummary = {
  open_count?: number
  completed_count?: number
  overdue_count?: number
  due_today_count?: number
  today_focus?: Assignment | null
}

type TrendPoint = { date: string; voice_score: number }

type DailyFeed = {
  coaching_summary?: string | null
  weakest_area?: { category?: string; score?: number } | null
  strongest_area?: { category?: string; score?: number } | null
  momentum_insight?: string | null
  momentum_delta?: number | null
  regression_warnings?: string[]
  recommended_replay?: { call_id?: string; score?: number } | null
  recommended_drill?: string | null
  coaching_urgency?: 'low' | 'medium' | 'high' | null
  ai_motivation_message?: string | null
  todays_focus?: string | null
}

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

const SKILL_CATEGORIES = [
  { key: 'discovery', label: 'Discovery' },
  { key: 'objection_handling', label: 'Objection Handling' },
  { key: 'closing', label: 'Closing' },
  { key: 'confidence', label: 'Confidence' },
]

const TIER_COLORS: Record<string, string> = {
  bronze: 'text-orange-300',
  silver: 'text-slate-300',
  gold: 'text-yellow-300',
  platinum: 'text-indigo-300',
  diamond: 'text-cyan-300',
}

// Rank names per XP level — purely cosmetic, no backend change needed
const RANK_NAMES: string[] = [
  'Novice',
  'Trainee I', 'Trainee II', 'Trainee III',
  'Prospect I', 'Prospect II', 'Prospect III',
  'Closer I', 'Closer II', 'Closer III',
  'Performer I', 'Performer II', 'Performer III',
  'Elite I', 'Elite II', 'Elite III',
  'Legend',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function computeStreak(assignments: Assignment[]): number {
  const days = new Set<string>()
  for (const a of assignments) {
    if (!a.completed_at) continue
    const t = new Date(a.completed_at)
    if (!Number.isNaN(t.getTime())) days.add(ymdLocal(t))
  }
  let streak = 0
  const cur = new Date()
  while (days.has(ymdLocal(cur))) {
    streak++
    cur.setDate(cur.getDate() - 1)
  }
  return streak
}

function xpLevel(xp: number): { level: number; pct: number; next: number; rank: string; nextRank: string } {
  const level = Math.floor(xp / 100)
  const pct = xp % 100
  const rank = RANK_NAMES[Math.min(level, RANK_NAMES.length - 1)]
  const nextRank = RANK_NAMES[Math.min(level + 1, RANK_NAMES.length - 1)]
  return { level, pct, next: (level + 1) * 100, rank, nextRank }
}

function trendDirection(trend: TrendPoint[]): 'improving' | 'declining' | 'stable' {
  if (trend.length < 4) return 'stable'
  const recent = trend.slice(-3).reduce((s, p) => s + p.voice_score, 0) / 3
  const earlier = trend.slice(-7, -4).reduce((s, p) => s + p.voice_score, 0) / 3
  if (recent - earlier > 3) return 'improving'
  if (earlier - recent > 3) return 'declining'
  return 'stable'
}

function trendDelta(trend: TrendPoint[]): number | null {
  if (trend.length < 4) return null
  const recent = trend.slice(-3).reduce((s, p) => s + p.voice_score, 0) / 3
  const earlier = trend.slice(-7, -4).reduce((s, p) => s + p.voice_score, 0) / 3
  return Math.round(recent - earlier)
}

function skillStatus(key: string, feed: DailyFeed | null): 'improving' | 'stable' | 'attention' {
  if (!feed) return 'stable'
  const weakest = String(feed.weakest_area?.category ?? '').toLowerCase().replace(/\s+/g, '_')
  const keyRoot = key.replace('_handling', '').split('_')[0]
  if (weakest && weakest.includes(keyRoot)) return 'attention'
  const warnings = (feed.regression_warnings ?? []).join(' ').toLowerCase()
  const keyword = key.replace('_handling', '').replace('_', ' ')
  if (warnings.includes(keyword)) return 'attention'
  const strongest = String(feed.strongest_area?.category ?? '').toLowerCase().replace(/\s+/g, '_')
  if (strongest && strongest.includes(keyRoot)) return 'improving'
  if ((feed.momentum_delta ?? 0) > 0) return 'improving'
  return 'stable'
}

// ── Skill bar fill level per status ──────────────────────────────────────────
function skillBarPct(status: 'improving' | 'stable' | 'attention'): number {
  if (status === 'improving') return 82
  if (status === 'attention') return 32
  return 58
}

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
  const expectedImpact = weakestArea ? `${weakestArea} improvement` : open > 0 ? 'XP + coaching compliance' : null

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
  if (overdue) return { label: overdue.title || 'Complete overdue assignment', detail: 'Past due — completing it keeps your streak and coaching score intact.', impact: 'Coaching compliance +', time: '10–20 min', href: '/assignments' }
  if (feed?.recommended_drill) return { label: feed.recommended_drill, detail: feed.coaching_summary || 'Your coach recommends this based on recent call patterns.', impact: feed.weakest_area?.category ? `${feed.weakest_area.category} improvement` : 'Performance improvement', time: '15–25 min', href: '/assignments' }
  const focus = summary?.today_focus
  if (focus) return { label: focus.title || "Today's assignment", detail: "Queued as today's coaching priority.", impact: 'XP + coaching compliance', time: '10–20 min', href: '/assignments' }
  const topOpen = assignments.find(a => a.status === 'open' || a.status === 'assigned')
  if (topOpen) return { label: topOpen.title || 'Complete open assignment', detail: 'Clear your coaching queue to maintain momentum.', impact: 'XP + streak', time: '10–20 min', href: '/assignments' }
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

  const streak = useMemo(() => computeStreak(assignments), [assignments])
  const openAssignments = useMemo(() =>
    summary?.open_count ?? assignments.filter(a => a.status === 'open' || a.status === 'assigned').length
  , [summary, assignments])
  const todayXp = useMemo(() => Number(me?.xp_today ?? 0), [me])
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

  return (
    <PageContainer>

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Dashboard</p>
          <h1 className="mt-0.5 text-xl font-semibold text-white">
            {me?.name ? `Good day, ${me.name.split(' ')[0]}` : 'My Dashboard'}
          </h1>
          <p className="mt-0.5 text-sm text-neutral-400">AI coaching briefing · {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}</p>
        </div>
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {/* ── Getting Started (onboarding) — visible only when no data yet ── */}
      {!hasAnyData && (
        <div className="space-y-3">
          <AiInsightCard
            type="recommendation"
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
              <div className="mt-0.5 text-xs text-neutral-500">Work through your coach's recommended drills.</div>
            </Link>
          </div>
        </div>
      )}

      {/* ── Section 1: AI Daily Briefing — Jarvis-style structured card ── */}
      <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/5 overflow-hidden">
        {/* Header row */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-fuchsia-500/10">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.14em] text-fuchsia-400 font-medium">AI Daily Briefing</span>
            {!hasAnyData && (
              <span className="rounded-full border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-[10px] text-neutral-500">Awaiting first scored call</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {briefing.urgency === 'high' && (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">High Urgency</span>
            )}
            {briefing.voiceTrend === 'improving' && (
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">↑ Improving</span>
            )}
            {briefing.voiceTrend === 'declining' && (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">↓ Watch</span>
            )}
          </div>
        </div>

        {/* Structured signal grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-0 divide-y divide-x divide-fuchsia-500/10">
          {/* Voice Score */}
          <div className="px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">Voice Score</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-semibold text-white">{briefing.voiceScore ?? '—'}</span>
              {briefing.voiceDelta !== null && briefing.voiceDelta !== 0 && (
                <span className={`text-xs font-medium ${briefing.voiceDelta > 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {briefing.voiceDelta > 0 ? '+' : ''}{briefing.voiceDelta}
                </span>
              )}
            </div>
          </div>

          {/* Weakest Area */}
          <div className="px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">Weakest Area</div>
            <div className="text-sm font-semibold text-amber-300">{briefing.weakestArea ?? '—'}</div>
            {briefing.weakestScore !== null && (
              <div className="text-[10px] text-neutral-600 mt-0.5">score {Math.round(briefing.weakestScore)}</div>
            )}
          </div>

          {/* Strongest Area */}
          <div className="px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">Strongest Area</div>
            {briefing.strongestArea
              ? <div className="text-sm font-semibold text-emerald-300">{briefing.strongestArea}</div>
              : <div className="text-sm text-neutral-600">No coaching data yet</div>
            }
          </div>

          {/* Open Assignments */}
          <div className="px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">Open Assignments</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-lg font-semibold text-white">{briefing.openAssignments}</span>
              {briefing.overdueAssignments > 0 && (
                <span className="text-xs text-red-400">{briefing.overdueAssignments} overdue</span>
              )}
              {briefing.openAssignments === 0 && !hasAnyData && (
                <span className="text-xs text-neutral-600">start below</span>
              )}
            </div>
          </div>

          {/* Recommended Action */}
          <div className="px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">Recommended Action</div>
            <div className="text-sm font-semibold text-indigo-300 truncate">
              {briefing.recommendedAction ?? 'Upload your first call'}
            </div>
          </div>

          {/* Expected Impact */}
          <div className="px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">Expected Impact</div>
            <div className="text-sm font-semibold text-cyan-300">
              {briefing.expectedImpact ?? 'Unlock coaching profile'}
            </div>
          </div>
        </div>

        {/* Motivation message if present */}
        {briefing.motivationMessage && (
          <div className="border-t border-fuchsia-500/10 px-4 py-2">
            <p className="text-[11px] text-fuchsia-300/70 italic">"{briefing.motivationMessage}"</p>
          </div>
        )}
      </div>

      {/* ── Section 2: Today's Mission KPI strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Open Assignments"
          value={openAssignments}
          subtext={summary?.overdue_count ? `${summary.overdue_count} overdue` : 'in queue'}
          variant={openAssignments > 0 ? (summary?.overdue_count ? 'danger' : 'warning') : 'success'}
        />
        <StatCard
          label="Today's XP"
          value={todayXp}
          subtext="earned today"
          variant={todayXp > 0 ? 'success' : 'default'}
        />
        <StatCard
          label="Streak"
          value={streak === 0 ? '—' : streak}
          subtext={streak === 1 ? 'day' : streak === 0 ? 'start today' : 'days'}
          variant={streak >= 3 ? 'success' : streak > 0 ? 'info' : 'default'}
        />
        <StatCard
          label="Voice Score"
          value={voiceScore ?? '—'}
          subtext="latest avg"
          variant={voiceScore === null ? 'default' : voiceScore >= 80 ? 'success' : voiceScore >= 60 ? 'warning' : 'danger'}
        />
      </div>

      {/* ── Section 3 + 4: Mission Centre + Skill Momentum (2-col) ── */}
      <div className="grid gap-4 xl:grid-cols-2">

        {/* Mission Centre — What should I do next? */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
          <div className="border-b border-neutral-800 px-4 py-3">
            <div className="text-sm font-semibold text-neutral-100">What should I do next?</div>
            <div className="text-xs text-neutral-500">Your highest-impact action right now.</div>
          </div>
          <div className="p-4">
            {mission ? (
              <div className="space-y-3">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-0.5">Recommended Action</div>
                  <div className="text-sm font-semibold text-indigo-300">{mission.label}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-0.5">Why</div>
                  <div className="text-xs text-neutral-400 leading-relaxed">{mission.detail}</div>
                </div>
                <div className="flex flex-wrap items-center gap-4 text-xs">
                  <div>
                    <span className="text-neutral-500">Impact: </span>
                    <span className="text-emerald-400/80 font-medium">{mission.impact}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500">Time: </span>
                    <span className="text-cyan-400/80 font-medium">{mission.time}</span>
                  </div>
                </div>
                <Link
                  href={mission.href}
                  className="inline-block rounded-lg bg-indigo-600/20 border border-indigo-500/20 px-3 py-2 text-xs font-semibold text-indigo-200 hover:bg-indigo-600/30 transition-colors"
                >
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
          </div>
        </div>

        {/* Skill Momentum Board */}
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
          <div className="border-b border-neutral-800 px-4 py-3">
            <div className="text-sm font-semibold text-neutral-100">Skill Momentum</div>
            <div className="text-xs text-neutral-500">Coaching signals from recent calls.</div>
          </div>
          <div className="p-4 space-y-4">
            {SKILL_CATEGORIES.map(({ key, label }) => {
              const noData = !feed && trend.length === 0
              const status = noData ? 'stable' : skillStatus(key, feed)
              const pct = noData ? 0 : skillBarPct(status)
              const isAttention = status === 'attention'
              const isImproving = status === 'improving'
              const barColor = noData ? 'bg-neutral-700/30' : isAttention ? 'bg-amber-400/60' : isImproving ? 'bg-emerald-400/60' : 'bg-neutral-600/60'
              const arrow = noData ? '—' : isAttention ? '↓' : isImproving ? '↑' : '→'
              const arrowCls = noData ? 'text-neutral-700' : isAttention ? 'text-amber-400' : isImproving ? 'text-emerald-400' : 'text-neutral-500'
              const statusLabel = noData ? 'Awaiting data' : isAttention ? 'Needs attention' : isImproving ? 'Improving' : 'Stable'
              const statusCls = noData ? 'text-neutral-600' : isAttention ? 'text-amber-400' : isImproving ? 'text-emerald-400' : 'text-neutral-500'

              return (
                <div key={key} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-sm ${noData ? 'text-neutral-500' : 'text-neutral-200'}`}>{label}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm font-semibold leading-none ${arrowCls}`}>{arrow}</span>
                      <span className={`text-xs font-medium ${statusCls}`}>{statusLabel}</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                      style={{ width: noData ? '100%' : `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
            {!feed && trend.length === 0 && (
              <p className="text-[11px] text-neutral-600 border-t border-neutral-800/50 pt-3">
                Upload a call to activate skill coaching signals.
              </p>
            )}
            {feed?.momentum_insight && (
              <p className="text-[11px] text-neutral-500 italic border-t border-neutral-800 pt-3">
                "{feed.momentum_insight}"
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Section 3 (Progress): Performance Progress chart ── */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
          <div>
            <div className="text-sm font-semibold text-neutral-100">Performance Progress</div>
            <div className="text-xs text-neutral-500">Voice score — last 30 days</div>
          </div>
          <div className="flex items-center gap-3">
            {latestAvg !== null && (
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-[0.1em] text-neutral-500">Latest avg</div>
                <div className="text-lg font-semibold text-white">{Math.round(latestAvg)}</div>
              </div>
            )}
            {trend.length > 0 && (
              <div className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                briefing.voiceTrend === 'improving' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' :
                briefing.voiceTrend === 'declining' ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' :
                'border-neutral-700 bg-neutral-900 text-neutral-400'
              }`}>
                {briefing.voiceTrend === 'improving' ? '↑ Improving' : briefing.voiceTrend === 'declining' ? '↓ Declining' : '→ Stable'}
              </div>
            )}
          </div>
        </div>
        <div className="px-4 pb-4 pt-2">
          {trend.length > 0 ? (
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <XAxis dataKey="date" stroke="#404040" tick={{ fontSize: 9 }} tickLine={false} />
                  <YAxis domain={[40, 100]} stroke="#404040" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} width={28} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #262626', borderRadius: 8, fontSize: 11 }}
                    labelStyle={{ color: '#737373' }}
                  />
                  <Line type="monotone" dataKey="voice_score" stroke="#22d3ee" strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: '#22d3ee', strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-36 flex flex-col items-center justify-center gap-2 border border-dashed border-neutral-800 rounded-lg">
              <div className="text-sm text-neutral-600">Awaiting first scored call</div>
              <Link href="/upload" className="text-xs text-cyan-500/70 hover:text-cyan-400 transition-colors">Upload a call →</Link>
            </div>
          )}
        </div>
      </div>

      {/* ── Section 5: Recent AI Feedback ── */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-neutral-400 uppercase tracking-[0.1em]">Recent AI Feedback</div>
        {feed?.coaching_summary
          ? <AiInsightCard type="summary" label="Coaching Summary" content={feed.coaching_summary} />
          : <AiInsightCard type="recommendation" label="No coaching data yet" content="Your AI feedback will appear here after your first scored call or sparring session. Upload a call to get started." />
        }
        {feed?.regression_warnings?.map((w, i) => (
          <AiInsightItem key={i} content={w} type="flag" />
        ))}
      </div>

      {/* ── Section 6: XP & Progression ── */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
        <div className="border-b border-neutral-800 px-4 py-3">
          <div className="text-sm font-semibold text-neutral-100">XP & Progression</div>
        </div>
        {totalXp > 0 ? (
          <div className="p-4 space-y-4">
            {/* Rank + XP summary */}
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase tracking-[0.1em] text-neutral-500">Current Rank</div>
                <div className="text-lg font-semibold text-white">{xpInfo.rank}</div>
              </div>
              <div className="text-right space-y-0.5">
                <div className="text-[10px] uppercase tracking-[0.1em] text-neutral-500">Total XP</div>
                <div className="text-lg font-semibold text-white">{totalXp.toLocaleString()}</div>
              </div>
              {streak > 0 && (
                <div className="text-right space-y-0.5">
                  <div className="text-[10px] uppercase tracking-[0.1em] text-neutral-500">Streak</div>
                  <div className="text-lg font-semibold text-amber-300">{streak}</div>
                </div>
              )}
            </div>

            {/* Progress bar to next rank */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span>Level {xpInfo.level} — {xpInfo.rank}</span>
                <span className="text-neutral-400">Next: {xpInfo.nextRank}</span>
              </div>
              <div className="h-2 rounded-full bg-neutral-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400 transition-all"
                  style={{ width: `${xpInfo.pct}%` }}
                />
              </div>
              <div className="text-xs text-neutral-600">{xpInfo.pct} / 100 XP — {100 - xpInfo.pct} to next rank</div>
            </div>

            {/* Next milestone hint */}
            {me?.tier && (
              <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-xs text-neutral-400">
                <span className="text-neutral-300 font-medium">Tier: </span>
                <span className={TIER_COLORS[tierKey] ?? 'text-neutral-300'}>{me.tier}</span>
                {todayXp > 0 && <span className="ml-3 text-emerald-400/70">+{todayXp} XP today</span>}
              </div>
            )}
          </div>
        ) : (
          <div className="px-4 py-5">
            <EmptyState
              message="No XP yet"
              sub="Complete assignments and calls to earn XP, build your rank, and unlock badges."
            />
          </div>
        )}
      </div>

      {/* ── Quick links ── */}
      <div className="flex flex-wrap items-center gap-2 pb-2">
        <Link href="/assignments" className="rounded-lg border border-neutral-800 px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200 transition-colors">Assignments</Link>
        <Link href="/call-library" className="rounded-lg border border-neutral-800 px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200 transition-colors">Call Library</Link>
        <Link href="/call-library?tab=sparring" className="rounded-lg border border-neutral-800 px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200 transition-colors">Sparring</Link>
        <Link href="/upload" className="rounded-lg border border-neutral-800 px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200 transition-colors">Upload Call</Link>
      </div>

    </PageContainer>
  )
}
