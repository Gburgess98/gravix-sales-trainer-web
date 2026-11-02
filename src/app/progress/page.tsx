'use client'

// Staging redesign — Progress (rep). One primary trend, skill breakdown, then completed work and
// development level. Built from the same endpoints Home already used (no new API surface);
// the chart, skill board and development level moved here from Home so nothing is duplicated.

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { proxyFetch } from '@/lib/api'
import { PageContainer } from '@/components/layout/page-container'
import { PageHeader } from '@/components/layout/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { StatCard } from '@/components/ui/stat-card'
import { EmptyState } from '@/components/ui/empty-state'
import { LoadingText } from '@/components/ui/loading-skeleton'
import { buttonClasses } from '@/components/ui/button'
import {
  SKILL_CATEGORIES,
  TIER_COLORS,
  skillStatus,
  trendDirection,
  xpLevel,
  type Assignment,
  type DailyFeed,
  type RepMe,
  type TrendPoint,
} from '@/lib/progress-model'

const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false })
const LineChart = dynamic(() => import('recharts').then(m => m.LineChart), { ssr: false })
const Line = dynamic(() => import('recharts').then(m => m.Line), { ssr: false })
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false })

export default function ProgressPage() {
  const [me, setMe] = useState<RepMe | null>(null)
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [latestAvg, setLatestAvg] = useState<number | null>(null)
  const [feed, setFeed] = useState<DailyFeed | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
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
        const meObj = d?.me ?? (d?.ok && d?.id ? d : null)
        if (d?.ok && meObj) { setMe(meObj); repId = meObj.id ?? null }
      }
      if (assignRes.status === 'fulfilled') {
        const d = await assignRes.value.json().catch(() => null)
        if (d?.ok) setAssignments(d.assignments ?? d.items ?? [])
      }
      if (trendRes.status === 'fulfilled') {
        const d = await trendRes.value.json().catch(() => null)
        if (d?.ok) { setTrend(d.trend ?? []); setLatestAvg(d.latest_avg ?? null) }
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

  useEffect(() => { load() }, [load])

  const voiceTrend = useMemo(() => trendDirection(trend), [trend])
  const voiceScore = useMemo(() => {
    if (latestAvg !== null) return Math.round(latestAvg)
    return trend.length > 0 ? Math.round(trend[trend.length - 1]?.voice_score ?? 0) : null
  }, [latestAvg, trend])
  const totalXp = useMemo(() => Number(me?.xp_total ?? 0), [me])
  const todayXp = useMemo(() => Number(me?.xp_today ?? 0), [me])
  const xpInfo = useMemo(() => xpLevel(totalXp), [totalXp])
  const streak = useMemo(() => {
    // same definition as Home: consecutive local days with a completed assignment
    const days = new Set<string>()
    for (const a of assignments) {
      if (!a.completed_at) continue
      const t = new Date(a.completed_at)
      if (!Number.isNaN(t.getTime())) days.add(t.toDateString())
    }
    let n = 0
    const cur = new Date()
    while (days.has(cur.toDateString())) { n++; cur.setDate(cur.getDate() - 1) }
    return n
  }, [assignments])
  const tierKey = String(me?.tier ?? '').toLowerCase()
  const completed = useMemo(
    () =>
      assignments
        .filter((a) => a.completed_at)
        .sort((a, b) => new Date(b.completed_at as string).getTime() - new Date(a.completed_at as string).getTime())
        .slice(0, 8),
    [assignments],
  )

  if (loading) {
    return (
      <PageContainer>
        <PageHeader glass title="Progress" subtitle="How your calls and practice are trending." />
        <LoadingText text="Loading your progress…" />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        glass
        title="Progress"
        subtitle="How your calls and practice are trending."
        actions={
          <Link href="/call-library?tab=sparring" className={buttonClasses('primary', 'md', 'whitespace-nowrap')}>
            Practise now
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          glass
          label="Voice Score"
          value={voiceScore ?? '—'}
          subtext={voiceScore === null ? 'after your first scored call' : 'latest avg'}
          variant={voiceScore === null ? 'default' : voiceScore >= 80 ? 'success' : voiceScore >= 60 ? 'warning' : 'danger'}
        />
        <StatCard
          glass
          label="Trend"
          value={trend.length === 0 ? '—' : voiceTrend === 'improving' ? '↑ Improving' : voiceTrend === 'declining' ? '↓ Declining' : '→ Stable'}
          subtext="voice score, last 30 days"
          valueClass="text-lg text-white"
        />
        <StatCard
          glass
          label="Level"
          value={xpInfo.rank}
          subtext={streak > 0 ? `${streak}-day practice streak` : 'complete an assignment to start a streak'}
          valueClass="text-lg text-white"
        />
      </div>

    <SectionCard
            title="Performance Progress"
            subtitle="Voice score — last 30 days"
            actions={
              <>
                {latestAvg !== null && (
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-[0.1em] text-neutral-500">Latest avg</div>
                    <div className="text-lg font-semibold text-white">{Math.round(latestAvg)}</div>
                  </div>
                )}
                {trend.length > 0 && (
                  <div className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                    voiceTrend === 'improving' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' :
                    voiceTrend === 'declining' ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' :
                    'border-neutral-700 bg-neutral-900 text-neutral-400'
                  }`}>
                    {voiceTrend === 'improving' ? '↑ Improving' : voiceTrend === 'declining' ? '↓ Declining' : '→ Stable'}
                  </div>
                )}
              </>
            }
          >
            <div className="px-5 pb-4 pt-2">
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
                      <Line type="monotone" dataKey="voice_score" stroke="#818cf8" strokeWidth={1.5} dot={false} activeDot={{ r: 3, fill: '#818cf8', strokeWidth: 0 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-36 flex flex-col items-center justify-center gap-2 border border-dashed border-neutral-800 rounded-lg">
                  <div className="text-sm text-neutral-600">Awaiting first scored call</div>
                  <Link href="/upload" className="text-xs text-indigo-300 hover:text-indigo-200 transition-colors">Upload a call →</Link>
                </div>
              )}
            </div>
          </SectionCard>

    <SectionCard title="Skill Momentum" subtitle="Coaching signals from recent calls.">
              <div className="px-5 py-4 space-y-4">
                {SKILL_CATEGORIES.map(({ key, label }) => {
                  const noData = !feed && trend.length === 0
                  const status = noData ? 'stable' : skillStatus(key, feed)
                  const isAttention = status === 'attention'
                  const isImproving = status === 'improving'
                  const arrow = noData ? '—' : isAttention ? '↓' : isImproving ? '↑' : '→'
                  const arrowCls = noData ? 'text-neutral-700' : isAttention ? 'text-amber-400' : isImproving ? 'text-emerald-400' : 'text-neutral-500'
                  const statusLabel = noData ? 'Awaiting data' : isAttention ? 'Needs attention' : isImproving ? 'Improving' : 'Stable'
                  const statusCls = noData ? 'text-neutral-600' : isAttention ? 'text-amber-400' : isImproving ? 'text-emerald-400' : 'text-neutral-500'

                  return (
                    <div key={key} className="flex items-center justify-between gap-2 border-b border-neutral-800/50 pb-2.5 last:border-b-0 last:pb-0">
                      <span className={`text-sm ${noData ? 'text-neutral-500' : 'text-neutral-200'}`}>{label}</span>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm font-semibold leading-none ${arrowCls}`}>{arrow}</span>
                        <span className={`text-xs font-medium ${statusCls}`}>{statusLabel}</span>
                      </div>
                    </div>
                  )
                })}
                {!feed && trend.length === 0 && (
                  <p className="text-[11px] text-neutral-600 border-t border-neutral-800/50 pt-3">
                    Trend data appears after more scored calls.
                  </p>
                )}
                {feed?.momentum_insight && (
                  <p className="text-[11px] text-neutral-500 italic border-t border-neutral-800 pt-3">
                    &quot;{feed.momentum_insight}&quot;
                  </p>
                )}
              </div>
            </SectionCard>

      <SectionCard title="Completed work" subtitle="Your most recent finished assignments.">
        {completed.length === 0 ? (
          <div className="px-4 py-5">
            <EmptyState
              message="Nothing completed yet"
              sub="Finished assignments and drills appear here."
              action={{ label: 'View assignments', onClick: () => { window.location.href = '/assignments' } }}
            />
          </div>
        ) : (
          <ul className="divide-y divide-neutral-900">
            {completed.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="min-w-0 truncate text-neutral-200">{a.title || 'Assignment'}</span>
                <span className="shrink-0 text-xs tabular-nums text-neutral-400">
                  {new Date(a.completed_at as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

    <SectionCard title="Development Progress">
            {totalXp > 0 ? (
              <div className="px-5 py-4 space-y-4">
                {/* Level + progress summary */}
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <div className="text-[10px] uppercase tracking-[0.1em] text-neutral-500">Performance Level</div>
                    <div className="text-lg font-semibold text-white">{xpInfo.rank}</div>
                  </div>
                  <div className="text-right space-y-0.5">
                    <div className="text-[10px] uppercase tracking-[0.1em] text-neutral-500">Progress Points</div>
                    <div className="text-lg font-semibold text-white">{totalXp.toLocaleString()}</div>
                  </div>
                  {streak > 0 && (
                    <div className="text-right space-y-0.5">
                      <div className="text-[10px] uppercase tracking-[0.1em] text-neutral-500">Streak</div>
                      <div className="text-lg font-semibold text-white">{streak}</div>
                    </div>
                  )}
                </div>

                {/* Progress bar to next level */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs text-neutral-500">
                    <span>Level {xpInfo.level} — {xpInfo.rank}</span>
                    <span className="text-neutral-400">Next level: {xpInfo.nextRank}</span>
                  </div>
                  <div className="h-2 rounded-full bg-neutral-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all"
                      style={{ width: `${xpInfo.pct}%` }}
                    />
                  </div>
                  <div className="text-xs text-neutral-600">{xpInfo.pct} / 100 points — {100 - xpInfo.pct} to next level</div>
                </div>

                {/* Operating level ── real backend tier, presentation only */}
                {me?.tier && (
                  <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-xs text-neutral-400">
                    <span className="text-neutral-300 font-medium">Operating level: </span>
                    <span className={TIER_COLORS[tierKey] ?? 'text-neutral-300'}>{me.tier}</span>
                    {todayXp > 0 && <span className="ml-3 text-neutral-400">+{todayXp} points today</span>}
                  </div>
                )}
              </div>
            ) : (
              <div className="px-4 py-5">
                <EmptyState
                  message="No progress recorded yet"
                  sub="Complete assignments and calls to build your performance level and reach your next milestone."
                />
              </div>
            )}
          </SectionCard>
    </PageContainer>
  )
}
