'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { WorkspaceTabs } from '@/components/shell/workspace-tabs'
import { proxyFetch } from '@/lib/api'
import { StatCard } from '@/components/ui/stat-card'
import { RiskBadge, ScorePill } from '@/components/ui/status-badge'
import { EmptyRow } from '@/components/ui/empty-state'
import { LoadingText } from '@/components/ui/loading-skeleton'
import { FilterBar, FilterOption } from '@/components/ui/filter-bar'

type CoachingTab = 'overview' | 'interventions' | 'assignments' | 'replay'
type RepFilter = 'all' | 'at_risk' | 'watch' | 'healthy'
type ConfidenceLevel = 'high' | 'medium' | 'low'
type UrgencyState = 'escalated' | 'critical' | 'high' | 'watch' | 'healthy'
type TrendDirection = 'rising' | 'stable' | 'improving'
type OutcomePrediction = 'improving' | 'recovering' | 'stable' | 'at_risk' | 'escalating'
type EffectivenessState = 'improving' | 'stable' | 'deteriorating'

type RepRisk = {
  rep_id: string
  rep_name: string
  risk_band?: string
  risk_score?: number
  counts?: { open?: number; overdue?: number; completed_today?: number }
  reasons?: string[]
  meta?: {
    weakest_skill?: string | null
    last_call_at?: string | null
    last_login_at?: string | null
    flagged_calls?: number | null
    critical_calls?: number | null
    avg_score?: number | null
    reasons?: string[]
    [key: string]: any
  }
}

type Headline = {
  reps_total?: number
  reps_at_risk?: number
  reps_watch?: number
  overdue_actions_total?: number
  open_actions_total?: number
  window_days?: number
}

type Reporting = {
  critical_calls_today?: number
  flagged_calls_this_week?: number
  auto_assignments_created?: number
  assignment_completion_rate?: number
  reps_needing_help?: Array<{
    rep_id: string
    flagged_calls?: number
    critical_calls?: number
    open_assignments?: number
    avg_score?: number | null
    weakest_skill?: string | null
  }>
}

type Assignment = {
  id: string
  title?: string | null
  type?: string
  status?: string
  rep_id?: string | null
  due_at?: string | null
  created_at: string
  meta?: Record<string, any> | null
}

type CallItem = {
  id: string
  filename?: string | null
  score_overall?: number | null
  created_at: string
  rep_name?: string | null
  status?: string
  flags?: string[] | null
}

type AssignmentFilter = 'open' | 'overdue' | 'all'
type ReplayThreshold = '70' | '60' | '50'

const ASSIGNMENT_FILTERS: FilterOption<AssignmentFilter>[] = [
  { value: 'open', label: 'Open' },
  { value: 'overdue', label: 'Overdue', variant: 'danger' },
  { value: 'all', label: 'All' },
]

const REPLAY_THRESHOLDS: FilterOption<ReplayThreshold>[] = [
  { value: '70', label: 'Below 70' },
  { value: '60', label: 'Below 60', variant: 'warning' },
  { value: '50', label: 'Below 50', variant: 'danger' },
]

// ── Design system maps ────────────────────────────────────────────────────────

const CONFIDENCE_STYLES: Record<ConfidenceLevel, string> = {
  high:   'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  medium: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  low:    'border-neutral-700 bg-neutral-900/60 text-neutral-400',
}

const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  high:   'High Confidence',
  medium: 'Medium Confidence',
  low:    'Low Confidence',
}

const URGENCY_LEFT: Record<UrgencyState, string> = {
  escalated: 'border-l-[3px] border-l-red-300',
  critical:  'border-l-[3px] border-l-red-500',
  high:      'border-l-[3px] border-l-amber-500',
  watch:     'border-l-[3px] border-l-cyan-500/50',
  healthy:   'border-l-[3px] border-l-emerald-500/30',
}

const URGENCY_BG: Record<UrgencyState, string> = {
  escalated: 'bg-red-500/[0.07]',
  critical:  'bg-red-500/[0.04]',
  high:      'bg-amber-500/[0.04]',
  watch:     'bg-neutral-950',
  healthy:   'bg-neutral-950',
}

const URGENCY_LABEL: Record<UrgencyState, string> = {
  escalated: 'Escalated',
  critical:  'Critical',
  high:      'High Priority',
  watch:     'Watch',
  healthy:   'Healthy',
}

const URGENCY_LABEL_CLS: Record<UrgencyState, string> = {
  escalated: 'text-red-300',
  critical:  'text-red-400',
  high:      'text-amber-400',
  watch:     'text-cyan-400',
  healthy:   'text-emerald-400',
}

const TREND_CONFIG: Record<TrendDirection, { arrow: string; cls: string }> = {
  rising:    { arrow: '↑', cls: 'text-red-400' },
  stable:    { arrow: '→', cls: 'text-neutral-400' },
  improving: { arrow: '↓', cls: 'text-emerald-400' },
}

const OUTCOME_CONFIG: Record<OutcomePrediction, { label: string; cls: string }> = {
  improving:  { label: 'Likely to improve',   cls: 'text-emerald-400' },
  recovering: { label: 'Momentum recovering', cls: 'text-cyan-400' },
  stable:     { label: 'Holding steady',      cls: 'text-neutral-400' },
  at_risk:    { label: 'Needs escalation',    cls: 'text-amber-400' },
  escalating: { label: 'High coaching risk',  cls: 'text-red-400' },
}

const EFFECTIVENESS_CONFIG: Record<EffectivenessState, { label: string; cls: string }> = {
  improving:    { label: '↑ Improving',     cls: 'text-emerald-400' },
  stable:       { label: '→ Stable',        cls: 'text-neutral-400' },
  deteriorating:{ label: '↓ Deteriorating', cls: 'text-red-400' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function urgencyBadgeClass(urgency?: string) {
  if (urgency === 'critical') return 'border-red-500/30 bg-red-500/10 text-red-300'
  if (urgency === 'high') return 'border-amber-500/30 bg-amber-500/10 text-amber-300'
  return 'border-neutral-700 bg-neutral-900 text-neutral-400'
}

function normaliseReasonLabel(value: string): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const cleaned = raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  const map: Array<[RegExp, string]> = [
    [/objection/, 'Objection handling'],
    [/weak close|closing|close/, 'Closing'],
    [/discovery/, 'Discovery'],
    [/intro|opening|opener/, 'Intro'],
    [/follow.?up/, 'Follow-up'],
    [/inactive|stale|no activity/, 'Inactivity'],
    [/overdue/, 'Overdue actions'],
    [/workload|too many open|open action/, 'Workload'],
    [/pric/, 'Price objection'],
    [/next.?step/, 'Next steps'],
  ]
  for (const [pattern, label] of map) {
    if (pattern.test(cleaned)) return label
  }
  return cleaned.split(' ').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ')
}

function collectRepReasons(rep: RepRisk): string[] {
  const direct = Array.isArray(rep.reasons) ? rep.reasons : []
  const metaReasons = Array.isArray(rep.meta?.reasons) ? rep.meta.reasons : []
  const labels = [...direct, ...metaReasons]
    .map(x => normaliseReasonLabel(String(x || '')))
    .filter(Boolean)
  return [...new Set(labels)]
}

function inferWeakestSkill(rep: RepRisk): string {
  const direct = String(rep.meta?.weakest_skill ?? '').trim()
  if (direct && direct.toLowerCase() !== 'unknown') return direct
  const reasons = collectRepReasons(rep)
  const joined = reasons.join(' | ').toLowerCase()
  if (joined.includes('objection')) return 'Objection handling'
  if (joined.includes('closing') || joined.includes('next steps')) return 'Closing'
  if (joined.includes('discovery')) return 'Discovery'
  if (joined.includes('intro')) return 'Intro'
  if (joined.includes('price objection')) return 'Price handling'
  if (joined.includes('follow-up')) return 'Follow-up'
  if (joined.includes('inactivity')) return 'Consistency'
  if (joined.includes('workload') || joined.includes('overdue actions')) return 'Execution'
  const overdue = Number(rep.counts?.overdue ?? 0)
  const open = Number(rep.counts?.open ?? 0)
  if (overdue > 0) return 'Execution'
  if (open > 6) return 'Prioritisation'
  if (open > 0) return 'Follow-up'
  return ''
}

function recommendManagerAction(rep: RepRisk): string {
  const overdue = Number(rep.counts?.overdue ?? 0)
  const open = Number(rep.counts?.open ?? 0)
  const weak = inferWeakestSkill(rep)
  const joined = collectRepReasons(rep).join(' | ').toLowerCase()
  if (overdue > 0) return 'Clear overdue actions first'
  if (joined.includes('objection')) return 'Assign objection drill'
  if (weak === 'Closing') return 'Review weak close calls'
  if (weak === 'Discovery') return 'Coach discovery questions'
  if (weak === 'Intro') return 'Tighten opener'
  if (open > 6) return 'Reduce workload and re-prioritise'
  if (weak === 'Follow-up') return 'Set follow-up target'
  return 'Review recent calls'
}

function recommendAssignment(rep: RepRisk): string {
  const weak = inferWeakestSkill(rep)
  const joined = collectRepReasons(rep).join(' | ').toLowerCase()
  if (joined.includes('price objection') || weak === 'Price handling') return 'Price objection rebuttal drill'
  if (joined.includes('objection') || weak === 'Objection handling') return 'Objection handling drill'
  if (weak === 'Closing' || joined.includes('next steps')) return 'Closing practice + next steps'
  if (weak === 'Discovery') return 'Discovery question drill'
  if (weak === 'Intro') return 'Opener improvement drill'
  if (weak === 'Follow-up' || weak === 'Execution') return 'Follow-up task assignment'
  return 'Review last 3 calls + feedback summary'
}

function getConfidence(rep: RepRisk, critical: number): ConfidenceLevel {
  const overdue = Number(rep.counts?.overdue ?? 0)
  if (overdue > 0 || critical > 0) return 'high'
  if (Number(rep.counts?.open ?? 0) >= 2) return 'medium'
  return 'low'
}

function getWhyMatters(rep: RepRisk, critical: number, flagged: number): string {
  const overdue = Number(rep.counts?.overdue ?? 0)
  const weak = inferWeakestSkill(rep)
  const reasons = collectRepReasons(rep)
  const joined = reasons.join(' | ').toLowerCase()
  if (critical > 0) return `${critical} critical call${critical !== 1 ? 's' : ''} need immediate review`
  if (overdue > 0) return `Ignoring coaching queue — ${overdue} overdue action${overdue !== 1 ? 's' : ''}`
  if (joined.includes('inactiv')) return 'No activity trend detected this period'
  if (weak === 'Objection handling') return 'Repeated objection failures across recent calls'
  if (weak === 'Closing') return 'Low close consistency, pattern worsening'
  if (weak === 'Discovery') return 'Skipping discovery phase repeatedly'
  if (weak === 'Price handling') return 'Losing deals at pricing stage'
  if (flagged > 0) return `${flagged} flagged call${flagged !== 1 ? 's' : ''} in 7d — recurring issues`
  return 'Below team performance baseline'
}

function getUrgencyState(rep: RepRisk, critical: number): UrgencyState {
  const overdue = Number(rep.counts?.overdue ?? 0)
  if (overdue > 2 && critical > 0) return 'escalated'
  if (overdue > 0 || critical > 0) return 'critical'
  if (rep.risk_band === 'at_risk') return 'high'
  if (rep.risk_band === 'watch') return 'watch'
  return 'healthy'
}

function mockTrend(count: number): TrendDirection {
  if (count >= 3) return 'rising'
  if (count === 1) return 'improving'
  return 'stable'
}

function getAssignmentReasoning(rep: RepRisk, critical: number, flagged: number): string {
  const overdue = Number(rep.counts?.overdue ?? 0)
  const weak = inferWeakestSkill(rep)
  if (critical > 0) return `${critical} critical call${critical !== 1 ? 's' : ''} with failed handling. Pattern repeating.`
  if (overdue > 0) return `${overdue} overdue action${overdue !== 1 ? 's' : ''} indicate coaching avoidance.`
  if (flagged > 0) return `${flagged} flagged call${flagged !== 1 ? 's' : ''} with recurring ${weak?.toLowerCase() || 'issues'}.`
  if (weak) return `Consistent ${weak.toLowerCase()} weakness detected across recent calls.`
  return 'Below team baseline across multiple sessions.'
}

function getExpectedOutcome(weak: string): string {
  if (weak === 'Objection handling') return 'Improve objection retention rate'
  if (weak === 'Closing') return 'Increase close rate consistency'
  if (weak === 'Discovery') return 'Strengthen pipeline qualification'
  if (weak === 'Follow-up' || weak === 'Execution') return 'Reduce stale contact rate'
  if (weak === 'Price handling') return 'Recover more price-objection deals'
  if (weak === 'Intro') return 'Increase early engagement rate'
  return 'Improve overall coaching compliance'
}

function getAssignmentUrgency(rep: RepRisk, critical: number): string {
  const overdue = Number(rep.counts?.overdue ?? 0)
  if (overdue > 0 || critical > 0) return 'Immediate'
  if (collectRepReasons(rep).length >= 2) return 'This week'
  return 'Next session'
}

function getCoachingMomentum(rep: RepRisk): 'positive' | 'neutral' | 'negative' {
  const overdue = Number(rep.counts?.overdue ?? 0)
  const doneToday = Number(rep.counts?.completed_today ?? 0)
  if (doneToday > 0 && overdue === 0) return 'positive'
  if (overdue > 0) return 'negative'
  return 'neutral'
}

function getRepTrend(rep: RepRisk): TrendDirection {
  const overdue = Number(rep.counts?.overdue ?? 0)
  const doneToday = Number(rep.counts?.completed_today ?? 0)
  if (overdue > 0) return 'rising'
  if (doneToday > 0) return 'improving'
  return 'stable'
}

// ── Day 78: Compliance + Outcome + Effectiveness ──────────────────────────────

function getComplianceScore(rep: RepRisk): number {
  const overdue = Number(rep.counts?.overdue ?? 0)
  const open = Number(rep.counts?.open ?? 0)
  const doneToday = Number(rep.counts?.completed_today ?? 0)
  let score = 70
  score -= overdue * 15
  score -= Math.max(0, open - 3) * 4
  score += doneToday * 8
  return Math.max(0, Math.min(100, Math.round(score)))
}

function getOutcomePrediction(rep: RepRisk, critical: number): OutcomePrediction {
  const overdue = Number(rep.counts?.overdue ?? 0)
  const doneToday = Number(rep.counts?.completed_today ?? 0)
  const compliance = getComplianceScore(rep)
  if (overdue > 2 || (critical > 1 && overdue > 0)) return 'escalating'
  if (overdue > 0 || critical > 0) return 'at_risk'
  if (doneToday > 0 && compliance >= 70) return 'improving'
  if (compliance >= 60) return 'recovering'
  return 'stable'
}

function inferReplayTarget(rep: RepRisk): string {
  const weak = inferWeakestSkill(rep)
  if (weak === 'Objection handling') return 'Review objection handling calls'
  if (weak === 'Closing') return 'Replay last 2 weak close attempts'
  if (weak === 'Discovery') return 'Review discovery phase calls'
  if (weak === 'Price handling') return 'Replay price objection scenarios'
  if (weak === 'Intro') return 'Review opening pitch calls'
  return 'Review lowest scored call this week'
}

function inferSparringDrill(rep: RepRisk): string {
  const weak = inferWeakestSkill(rep)
  if (weak === 'Objection handling') return 'Live objection response sparring'
  if (weak === 'Closing') return 'Closing sequence role-play'
  if (weak === 'Discovery') return 'Discovery conversation drill'
  if (weak === 'Price handling') return 'Price negotiation sparring'
  if (weak === 'Intro') return 'Opening pitch sparring'
  return 'Full call simulation'
}

function getAssignmentEffectiveness(rep: RepRisk): EffectivenessState {
  const overdue = Number(rep.counts?.overdue ?? 0)
  const doneToday = Number(rep.counts?.completed_today ?? 0)
  if (doneToday > 0 && overdue === 0) return 'improving'
  if (overdue > 1) return 'deteriorating'
  return 'stable'
}

// ── Manager Briefing ──────────────────────────────────────────────────────────

function generateManagerBriefing(
  reps: RepRisk[],
  headline: Headline | null,
  weaknessData: [string, number][],
  reporting: Reporting | null,
): string[] {
  const escalatedReps = reps.filter(r => Number(r.counts?.overdue ?? 0) > 2)
  const criticalReps = reps.filter(r => Number(r.counts?.overdue ?? 0) > 0)
  const nonEscalatedCritical = criticalReps.length - escalatedReps.length
  const atRisk = Number(headline?.reps_at_risk ?? 0)
  const topWeakness = weaknessData[0]?.[0]
  const secondWeakness = weaknessData[1]?.[0]
  const overdue = Number(headline?.overdue_actions_total ?? 0)
  const completionRate = reporting?.assignment_completion_rate ?? null
  const bullets: string[] = []

  if (escalatedReps.length > 0) {
    bullets.push(`${escalatedReps.length} rep${escalatedReps.length !== 1 ? 's' : ''} escalating toward critical — immediate manager intervention required.`)
  }
  if (nonEscalatedCritical > 0) {
    bullets.push(`${nonEscalatedCritical} rep${nonEscalatedCritical !== 1 ? 's' : ''} with overdue actions — coaching queue being ignored.`)
  }
  if (atRisk > 0) {
    bullets.push(`${atRisk} rep${atRisk !== 1 ? 's' : ''} trending toward risk this week.`)
  }
  if (topWeakness) {
    const count = weaknessData[0][1]
    bullets.push(`${topWeakness} is the leading team weakness — ${count} rep${count !== 1 ? 's' : ''} affected.`)
  }
  if (secondWeakness && weaknessData[1][1] >= 2) {
    bullets.push(`${secondWeakness} patterns emerging as secondary weakness.`)
  }
  if (overdue > 0) {
    bullets.push(`${overdue} overdue action${overdue !== 1 ? 's' : ''} require escalation today.`)
  }
  if (completionRate !== null) {
    const pct = Math.round(completionRate * 100)
    bullets.push(`Assignment completion rate: ${pct}%${pct >= 70 ? ' — above target' : pct >= 50 ? ' — below target' : ' — critical'}.`)
  }
  if (bullets.length === 0) {
    bullets.push('All reps on track. No immediate interventions required.')
  }
  return bullets
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CoachingPage() {
  const [tab, setTab] = useState<CoachingTab>('overview')
  const [repFilter, setRepFilter] = useState<RepFilter>('all')

  const [reps, setReps] = useState<RepRisk[]>([])
  const [headline, setHeadline] = useState<Headline | null>(null)
  const [reporting, setReporting] = useState<Reporting | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [overviewError, setOverviewError] = useState<string | null>(null)

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [assignmentsLoading, setAssignmentsLoading] = useState(false)
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>('open')

  const [calls, setCalls] = useState<CallItem[]>([])
  const [replayLoading, setReplayLoading] = useState(false)
  const [replayThreshold, setReplayThreshold] = useState<ReplayThreshold>('70')

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true)
    setOverviewError(null)
    try {
      const [ccRes, repRes] = await Promise.all([
        proxyFetch('/v1/crm/manager/control-centre?days=7&limit=20', { cache: 'no-store' }),
        proxyFetch('/v1/dashboard/reporting-summary?days=7', { cache: 'no-store' }),
      ])
      const ccData = await ccRes.json()
      const repData = await repRes.json().catch(() => ({}))
      if (ccData?.ok) {
        setHeadline(ccData.headline ?? null)
        const allReps: RepRisk[] = ccData.reps_all ?? []
        allReps.sort((a, b) => {
          const ao = Number(a.counts?.overdue ?? 0)
          const bo = Number(b.counts?.overdue ?? 0)
          if (bo !== ao) return bo - ao
          return Number(b.counts?.open ?? 0) - Number(a.counts?.open ?? 0)
        })
        setReps(allReps)
      } else {
        setOverviewError(ccData.error || 'Failed to load coaching data')
      }
      if (repData?.ok) setReporting(repData)
    } catch (e: any) {
      setOverviewError(e?.message || 'Connection error')
    } finally {
      setOverviewLoading(false)
    }
  }, [])

  const loadAssignments = useCallback(async () => {
    setAssignmentsLoading(true)
    try {
      const res = await proxyFetch('/v1/assignments?limit=40', { cache: 'no-store' })
      const data = await res.json()
      setAssignments(data.assignments ?? data.items ?? [])
    } catch { setAssignments([]) } finally { setAssignmentsLoading(false) }
  }, [])

  const loadReplay = useCallback(async () => {
    setReplayLoading(true)
    try {
      const res = await proxyFetch('/v1/calls/paged?limit=50&scope=company', { cache: 'no-store' })
      const data = await res.json()
      const rawCalls: CallItem[] = data.calls ?? data.items ?? []
      setCalls(rawCalls.filter(c => typeof c.score_overall === 'number').sort((a, b) => (a.score_overall ?? 999) - (b.score_overall ?? 999)))
    } catch { setCalls([]) } finally { setReplayLoading(false) }
  }, [])

  useEffect(() => { loadOverview() }, [loadOverview])
  useEffect(() => {
    if (tab === 'assignments' && assignments.length === 0) loadAssignments()
    if (tab === 'replay' && calls.length === 0) loadReplay()
  }, [tab, assignments.length, calls.length, loadAssignments, loadReplay])

  const filteredAssignments = assignments.filter((a) => {
    if (assignmentFilter === 'open') return a.status === 'open' || a.status === 'assigned'
    if (assignmentFilter === 'overdue') {
      if (!a.due_at) return false
      return new Date(a.due_at) < new Date() && (a.status === 'open' || a.status === 'assigned')
    }
    return true
  })

  const thresholdNum = Number(replayThreshold)
  const filteredCalls = calls.filter((c) => (c.score_overall ?? 999) < thresholdNum)
  const filteredReps = repFilter === 'all' ? reps : reps.filter(r => (r.risk_band ?? '') === repFilter)
  const topReps = reps.slice(0, 5)

  const weaknessData = useMemo(() => Array.from(
    reps.reduce((acc, rep) => {
      collectRepReasons(rep).forEach(r => { if (r) acc.set(r, (acc.get(r) ?? 0) + 1) })
      return acc
    }, new Map<string, number>())
  ).sort((a, b) => b[1] - a[1]).slice(0, 6), [reps])

  const totalWeaknessCount = useMemo(() => weaknessData.reduce((s, [, c]) => s + c, 0), [weaknessData])

  const reportingByRep = useMemo(() => new Map(
    (reporting?.reps_needing_help ?? []).map(r => [String(r.rep_id), r])
  ), [reporting])

  const managerBriefing = useMemo(
    () => generateManagerBriefing(reps, headline, weaknessData, reporting),
    [reps, headline, weaknessData, reporting]
  )

  const URGENCY_ORDER: Record<UrgencyState, number> = { escalated: 0, critical: 1, high: 2, watch: 3, healthy: 4 }

  const interventionQueue = useMemo(() => [...reps].map(rep => {
    const repRow = reportingByRep.get(rep.rep_id)
    const critical = Number(repRow?.critical_calls ?? rep.meta?.critical_calls ?? 0)
    const flagged = Number(repRow?.flagged_calls ?? rep.meta?.flagged_calls ?? 0)
    const urgency = getUrgencyState(rep, critical)
    const compliance = getComplianceScore(rep)
    const prediction = getOutcomePrediction(rep, critical)
    const effectiveness = getAssignmentEffectiveness(rep)
    const weak = inferWeakestSkill(rep)
    const action = recommendManagerAction(rep)
    return { rep, urgency, compliance, prediction, effectiveness, weak, action, critical, flagged }
  }).sort((a, b) => {
    const uo = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency]
    if (uo !== 0) return uo
    return a.compliance - b.compliance
  }), [reps, reportingByRep]) // eslint-disable-line react-hooks/exhaustive-deps

  const interventionCount = useMemo(
    () => interventionQueue.filter(({ urgency }) => urgency === 'escalated' || urgency === 'critical').length,
    [interventionQueue]
  )

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Coaching</p>
          <h1 className="mt-0.5 text-xl font-semibold text-white">Command Centre</h1>
          <p className="mt-0.5 text-sm text-neutral-400">Rep interventions · Assignment queue · Replay review</p>
        </div>
      </div>

      <WorkspaceTabs
        tabs={[
          { id: 'overview', label: 'Overview', badge: headline?.reps_at_risk || undefined },
          { id: 'interventions', label: 'Interventions', badge: interventionCount || undefined },
          { id: 'assignments', label: 'Assignments' },
          { id: 'replay', label: 'Replay Queue' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div className="space-y-5">
          {overviewLoading && <LoadingText text="Loading coaching intelligence…" />}
          {overviewError && !overviewLoading && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-4 text-sm text-red-300">{overviewError}</div>
          )}

          {!overviewLoading && !overviewError && (
            <>
              {/* Manager Briefing */}
              <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/5 px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-fuchsia-400 font-medium">AI Manager Briefing</span>
                  <span className="text-[10px] text-neutral-600">· {reps.length} reps analysed</span>
                </div>
                <ul className="space-y-1">
                  {managerBriefing.map((bullet, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-neutral-200 leading-relaxed">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-fuchsia-400/60" />
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>

              {/* 8 KPI cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label="At Risk" value={headline?.reps_at_risk ?? 0} subtext="reps" variant="danger" />
                <StatCard label="Watch" value={headline?.reps_watch ?? 0} subtext="reps" variant="warning" />
                <StatCard label="Overdue Actions" value={headline?.overdue_actions_total ?? 0} variant={(headline?.overdue_actions_total ?? 0) > 0 ? 'danger' : 'default'} />
                <StatCard label="Open Actions" value={headline?.open_actions_total ?? 0} />
                <StatCard label="Critical Today" value={reporting?.critical_calls_today ?? 0} variant={(reporting?.critical_calls_today ?? 0) > 0 ? 'danger' : 'default'} />
                <StatCard label="Flagged 7d" value={reporting?.flagged_calls_this_week ?? 0} variant={(reporting?.flagged_calls_this_week ?? 0) > 0 ? 'warning' : 'default'} />
                <StatCard label="Auto Assignments" value={reporting?.auto_assignments_created ?? 0} variant="info" />
                <StatCard label="Reps Tracked" value={headline?.reps_total ?? reps.length} />
              </div>

              {/* 3-column intelligence grid */}
              <div className="grid gap-4 xl:grid-cols-3">

                {/* Col 1 — Who needs help? */}
                <div className="flex flex-col rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
                  <div className="border-b border-neutral-800 px-4 py-3">
                    <div className="text-sm font-semibold text-neutral-100">1. Who needs help?</div>
                    <div className="text-xs text-neutral-500">Ranked by urgency with outcome prediction.</div>
                  </div>
                  <div className="flex-1 p-3 space-y-2">
                    {topReps.length === 0 ? (
                      <div className="px-2 py-4 text-sm text-neutral-400">No reps need intervention right now.</div>
                    ) : topReps.map((rep) => {
                      const overdue = Number(rep.counts?.overdue ?? 0)
                      const open = Number(rep.counts?.open ?? 0)
                      const repRow = reportingByRep.get(rep.rep_id)
                      const flagged = Number(repRow?.flagged_calls ?? rep.meta?.flagged_calls ?? 0)
                      const critical = Number(repRow?.critical_calls ?? rep.meta?.critical_calls ?? 0)
                      const avgScore = repRow?.avg_score ?? (rep.meta?.avg_score as number | null | undefined) ?? null
                      const weak = inferWeakestSkill(rep)
                      const action = recommendManagerAction(rep)
                      const confidence = getConfidence(rep, critical)
                      const urgency = getUrgencyState(rep, critical)
                      const why = getWhyMatters(rep, critical, flagged)
                      const compliance = getComplianceScore(rep)
                      const prediction = getOutcomePrediction(rep, critical)
                      const outcomeCfg = OUTCOME_CONFIG[prediction]

                      return (
                        <div
                          key={rep.rep_id}
                          className={`rounded-lg border border-neutral-800 px-3 py-3 space-y-2 ${URGENCY_LEFT[urgency]} ${URGENCY_BG[urgency]}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Link href={`/reps/${rep.rep_id}`} className="text-sm font-medium text-white hover:underline">
                                {rep.rep_name}
                              </Link>
                              {rep.risk_band && <RiskBadge band={rep.risk_band} />}
                            </div>
                            <span className={`text-[10px] font-semibold uppercase tracking-wide shrink-0 ${URGENCY_LABEL_CLS[urgency]}`}>
                              {URGENCY_LABEL[urgency]}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${CONFIDENCE_STYLES[confidence]}`}>
                              {CONFIDENCE_LABELS[confidence]}
                            </span>
                            <span className="text-[10px] text-neutral-500">
                              Compliance: <span className={compliance >= 70 ? 'text-emerald-400' : compliance >= 50 ? 'text-amber-400' : 'text-red-400'}>{compliance}</span>
                            </span>
                          </div>

                          <p className="text-[11px] text-neutral-400 italic">"{why}"</p>
                          <div className={`text-[11px] font-medium ${outcomeCfg.cls}`}>{outcomeCfg.label}</div>

                          {weak && (
                            <div className="text-[11px] text-neutral-500">
                              Weakest: <span className="text-neutral-300">{weak}</span>
                            </div>
                          )}
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-neutral-500">
                            {flagged > 0 && <span>Flags: <span className="text-neutral-300">{flagged}</span></span>}
                            {critical > 0 && <span>Critical: <span className="text-red-300">{critical}</span></span>}
                            {typeof avgScore === 'number' && <span>Avg: <span className="text-neutral-300">{Math.round(avgScore)}</span></span>}
                            <span>Overdue: <span className={overdue > 0 ? 'text-red-300' : 'text-neutral-200'}>{overdue}</span></span>
                            <span>Open: <span className="text-neutral-200">{open}</span></span>
                          </div>

                          <div className="text-xs font-medium text-amber-300">{action}</div>

                          <div className="flex gap-2 pt-0.5">
                            <Link href={`/reps/${rep.rep_id}`} className="rounded-md bg-indigo-600/20 px-2 py-1 text-xs font-semibold text-indigo-200 hover:bg-indigo-600/30 transition-colors">
                              View rep
                            </Link>
                            <Link href={`/crm/actions?repId=${encodeURIComponent(rep.rep_id)}&status=open`} className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800 transition-colors">
                              Open actions
                            </Link>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Col 2 — What are they bad at? */}
                <div className="flex flex-col rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
                  <div className="border-b border-neutral-800 px-4 py-3">
                    <div className="text-sm font-semibold text-neutral-100">2. What are they bad at?</div>
                    <div className="text-xs text-neutral-500">Team weakness patterns with trend direction.</div>
                  </div>
                  <div className="flex-1 p-4 space-y-3">
                    {weaknessData.length === 0 ? (
                      <div className="text-sm text-neutral-400">No recurring patterns detected yet.</div>
                    ) : weaknessData.map(([label, count]) => {
                      const trend = mockTrend(count)
                      const trendCfg = TREND_CONFIG[trend]
                      const pct = totalWeaknessCount > 0 ? Math.round((count / totalWeaknessCount) * 100) : 0

                      return (
                        <div key={label} className="space-y-1">
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className={`text-base leading-none ${trendCfg.cls}`}>{trendCfg.arrow}</span>
                              <span className="text-neutral-200 truncate">{label}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] text-neutral-500">{pct}%</span>
                              <span className="text-xs font-semibold tabular-nums text-neutral-400">{count}</span>
                            </div>
                          </div>
                          <div className="h-1.5 rounded-full bg-neutral-900 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${trend === 'rising' ? 'bg-red-400/60' : trend === 'improving' ? 'bg-emerald-400/60' : 'bg-amber-400/60'}`}
                              style={{ width: `${Math.min(100, Math.max(8, pct * 1.4))}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Col 3 — Coaching Plans */}
                <div className="flex flex-col rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
                  <div className="border-b border-neutral-800 px-4 py-3">
                    <div className="text-sm font-semibold text-neutral-100">3. Coaching Plans</div>
                    <div className="text-xs text-neutral-500">AI-generated: drill · replay · sparring per rep.</div>
                  </div>
                  <div className="flex-1 p-3 space-y-2">
                    {topReps.length === 0 ? (
                      <div className="px-2 py-4 text-sm text-neutral-400">No coaching plans generated yet.</div>
                    ) : topReps.map((rep) => {
                      const repRow = reportingByRep.get(rep.rep_id)
                      const critical = Number(repRow?.critical_calls ?? rep.meta?.critical_calls ?? 0)
                      const flagged = Number(repRow?.flagged_calls ?? rep.meta?.flagged_calls ?? 0)
                      const weak = inferWeakestSkill(rep)
                      const drill = recommendAssignment(rep)
                      const replay = inferReplayTarget(rep)
                      const sparring = inferSparringDrill(rep)
                      const reasoning = getAssignmentReasoning(rep, critical, flagged)
                      const outcome = getExpectedOutcome(weak)
                      const urgencyStr = getAssignmentUrgency(rep, critical)
                      const confidence = getConfidence(rep, critical)

                      return (
                        <div key={rep.rep_id} className="rounded-lg border border-neutral-800 bg-neutral-900/30 px-3 py-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-neutral-100">{rep.rep_name}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${CONFIDENCE_STYLES[confidence]}`}>
                                {confidence === 'high' ? 'High' : confidence === 'medium' ? 'Med' : 'Low'}
                              </span>
                              <span className="text-[10px] text-neutral-500 uppercase tracking-wide">{urgencyStr}</span>
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div>
                              <div className="text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-0.5">Drill</div>
                              <div className="text-sm font-semibold text-indigo-300">{drill}</div>
                            </div>
                            <div>
                              <div className="text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-0.5">Replay</div>
                              <div className="text-[11px] text-cyan-300/80">{replay}</div>
                            </div>
                            <div>
                              <div className="text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-0.5">Sparring</div>
                              <div className="text-[11px] text-fuchsia-300/80">{sparring}</div>
                            </div>
                            <div>
                              <div className="text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-0.5">Why</div>
                              <div className="text-[11px] text-neutral-400 leading-relaxed">{reasoning}</div>
                            </div>
                            <div>
                              <div className="text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-0.5">Expected Impact</div>
                              <div className="text-[11px] text-emerald-400/80">{outcome}</div>
                            </div>
                          </div>

                          <Link
                            href={`/admin/assignments?repId=${encodeURIComponent(rep.rep_id)}&repName=${encodeURIComponent(rep.rep_name)}&source=coaching`}
                            className="inline-block rounded-md bg-indigo-600/20 px-2 py-1 text-xs font-semibold text-indigo-200 hover:bg-indigo-600/30 transition-colors"
                          >
                            Assign drill →
                          </Link>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Coaching Health Timeline */}
              {reps.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-neutral-200">Coaching Health</span>
                    <span className="text-xs text-neutral-500">— momentum across all reps</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
                    {reps.map((rep) => {
                      const overdue = Number(rep.counts?.overdue ?? 0)
                      const open = Number(rep.counts?.open ?? 0)
                      const doneToday = Number(rep.counts?.completed_today ?? 0)
                      const trend = getRepTrend(rep)
                      const momentum = getCoachingMomentum(rep)
                      const trendCfg = TREND_CONFIG[trend]
                      const urgency = getUrgencyState(rep, 0)
                      const momentumCls = momentum === 'positive' ? 'text-emerald-400' : momentum === 'negative' ? 'text-red-400' : 'text-neutral-400'
                      const momentumLabel = momentum === 'positive' ? 'Active' : momentum === 'negative' ? 'Stalled' : 'Idle'

                      return (
                        <Link
                          key={rep.rep_id}
                          href={`/reps/${rep.rep_id}`}
                          className={`group rounded-lg border border-neutral-800 px-3 py-2.5 hover:bg-neutral-900/50 transition-colors ${URGENCY_LEFT[urgency]}`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="text-xs font-medium text-white truncate group-hover:text-neutral-200">{rep.rep_name}</span>
                            <span className={`text-sm font-semibold ${trendCfg.cls}`}>{trendCfg.arrow}</span>
                          </div>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
                            <span className={momentumCls}>{momentumLabel}</span>
                            {overdue > 0 && <span className="text-red-400">{overdue} overdue</span>}
                            <span className="text-neutral-500">{open} open</span>
                            {doneToday > 0 && <span className="text-emerald-400">{doneToday} done today</span>}
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Full rep table */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {(['all', 'at_risk', 'watch', 'healthy'] as RepFilter[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setRepFilter(f)}
                      className={`rounded-xl border px-3 py-1.5 text-xs transition-all ${
                        repFilter === f
                          ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'
                          : 'border-neutral-800 bg-black/30 text-neutral-400 hover:border-neutral-700'
                      }`}
                    >
                      {f === 'all' ? 'All' : f === 'at_risk' ? 'At Risk' : f === 'watch' ? 'Watch' : 'Healthy'}
                    </button>
                  ))}
                  <span className="ml-auto text-xs text-neutral-500">{filteredReps.length} reps</span>
                </div>

                <div className="rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
                  {filteredReps.length === 0 ? (
                    <EmptyRow message="No reps in this band." />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-neutral-800">
                            <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Rep</th>
                            <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Weakest Skill</th>
                            <th className="px-4 py-3 text-right text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Overdue</th>
                            <th className="px-4 py-3 text-right text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Open</th>
                            <th className="px-4 py-3 text-right text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Done Today</th>
                            <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Recommended Action</th>
                            <th className="px-4 py-3" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-800/50">
                          {filteredReps.map((rep) => {
                            const overdue = Number(rep.counts?.overdue ?? 0)
                            const open = Number(rep.counts?.open ?? 0)
                            const doneToday = Number(rep.counts?.completed_today ?? 0)
                            const weak = inferWeakestSkill(rep)
                            const action = recommendManagerAction(rep)
                            const reasons = collectRepReasons(rep)
                            const repRow = reportingByRep.get(rep.rep_id)
                            const critical = Number(repRow?.critical_calls ?? rep.meta?.critical_calls ?? 0)
                            const urgency = getUrgencyState(rep, critical)

                            return (
                              <tr key={rep.rep_id} className={`transition-colors hover:bg-neutral-900/30 ${URGENCY_BG[urgency]}`}>
                                <td className={`px-4 py-3 ${URGENCY_LEFT[urgency]}`}>
                                  <Link href={`/reps/${rep.rep_id}`} className="font-medium text-white hover:underline">{rep.rep_name}</Link>
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {rep.risk_band && <RiskBadge band={rep.risk_band} />}
                                    {reasons.slice(0, 2).map((r, i) => (
                                      <span key={`${r}-${i}`} className="rounded-full border border-neutral-800 bg-neutral-900/40 px-2 py-0.5 text-[10px] text-neutral-400">{r}</span>
                                    ))}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-sm text-neutral-300">{weak || '—'}</td>
                                <td className="px-4 py-3 text-right">
                                  {overdue > 0
                                    ? <span className="rounded-md bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-300">{overdue}</span>
                                    : <span className="text-sm text-neutral-400">0</span>}
                                </td>
                                <td className="px-4 py-3 text-right text-sm text-neutral-300">{open}</td>
                                <td className="px-4 py-3 text-right">
                                  {doneToday > 0
                                    ? <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300">{doneToday}</span>
                                    : <span className="text-sm text-neutral-400">0</span>}
                                </td>
                                <td className="px-4 py-3 text-xs text-amber-300/80">{action}</td>
                                <td className="px-4 py-3">
                                  <div className="flex justify-end gap-2">
                                    <Link href={`/crm/actions?repId=${encodeURIComponent(rep.rep_id)}&status=open`} className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800 transition-colors">
                                      Actions
                                    </Link>
                                    <Link href={`/admin/assignments?repId=${encodeURIComponent(rep.rep_id)}&repName=${encodeURIComponent(rep.rep_name)}&source=coaching`} className="rounded-md bg-indigo-600/20 px-2 py-1 text-xs font-semibold text-indigo-200 hover:bg-indigo-600/30 transition-colors">
                                      Assign
                                    </Link>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── INTERVENTIONS ── */}
      {tab === 'interventions' && (
        <div className="space-y-4">
          {overviewLoading && <LoadingText text="Loading intervention queue…" />}
          {overviewError && !overviewLoading && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-4 text-sm text-red-300">{overviewError}</div>
          )}
          {!overviewLoading && !overviewError && (
            <>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-neutral-100">Intervention Priority Queue</div>
                  <div className="text-xs text-neutral-500 mt-0.5">Ranked by escalation severity · lowest compliance first.</div>
                </div>
                <span className="text-xs text-neutral-500">{interventionQueue.length} reps</span>
              </div>

              {interventionQueue.length === 0 ? (
                <div className="rounded-xl border border-neutral-800 px-4 py-5 text-sm text-neutral-400">No reps in intervention queue.</div>
              ) : (
                <div className="rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-neutral-800">
                          <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium w-8">#</th>
                          <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Rep</th>
                          <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Urgency</th>
                          <th className="px-4 py-3 text-right text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Compliance</th>
                          <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Outcome</th>
                          <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Engagement</th>
                          <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Next Action</th>
                          <th className="px-4 py-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-800/50">
                        {interventionQueue.map(({ rep, urgency, compliance, prediction, effectiveness, weak, action }, idx) => {
                          const outcomeCfg = OUTCOME_CONFIG[prediction]
                          const effectCfg = EFFECTIVENESS_CONFIG[effectiveness]
                          return (
                            <tr key={rep.rep_id} className={`transition-colors hover:bg-neutral-900/30 ${URGENCY_BG[urgency]}`}>
                              <td className={`px-4 py-3 text-xs text-neutral-500 tabular-nums ${URGENCY_LEFT[urgency]}`}>{idx + 1}</td>
                              <td className="px-4 py-3">
                                <Link href={`/reps/${rep.rep_id}`} className="font-medium text-white hover:underline">{rep.rep_name}</Link>
                                {weak && <div className="text-[10px] text-neutral-500 mt-0.5">{weak}</div>}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`text-xs font-semibold uppercase tracking-wide ${URGENCY_LABEL_CLS[urgency]}`}>
                                  {URGENCY_LABEL[urgency]}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <span className={`text-sm font-semibold tabular-nums ${compliance >= 70 ? 'text-emerald-400' : compliance >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                                  {compliance}
                                </span>
                              </td>
                              <td className={`px-4 py-3 text-xs font-medium ${outcomeCfg.cls}`}>{outcomeCfg.label}</td>
                              <td className={`px-4 py-3 text-xs font-medium ${effectCfg.cls}`}>{effectCfg.label}</td>
                              <td className="px-4 py-3 text-xs text-amber-300/80 max-w-[180px]">{action}</td>
                              <td className="px-4 py-3">
                                <div className="flex justify-end gap-1.5">
                                  <Link href={`/crm/actions?repId=${encodeURIComponent(rep.rep_id)}&status=open`} className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800 transition-colors">
                                    Actions
                                  </Link>
                                  <Link href={`/admin/assignments?repId=${encodeURIComponent(rep.rep_id)}&repName=${encodeURIComponent(rep.rep_name)}&source=interventions`} className="rounded-md bg-indigo-600/20 px-2 py-1 text-xs font-semibold text-indigo-200 hover:bg-indigo-600/30 transition-colors">
                                    Assign
                                  </Link>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── ASSIGNMENTS ── */}
      {tab === 'assignments' && (
        <div className="space-y-3">
          <FilterBar
            options={ASSIGNMENT_FILTERS}
            value={assignmentFilter}
            onChange={setAssignmentFilter}
            count={assignmentsLoading ? undefined : filteredAssignments.length}
            countLabel="assignments"
          />
          {assignmentsLoading && <LoadingText text="Loading assignments…" />}
          {!assignmentsLoading && filteredAssignments.length === 0 && (
            <div className="rounded-xl border border-neutral-800 px-4 py-5 text-sm text-neutral-400">
              No {assignmentFilter !== 'all' ? assignmentFilter + ' ' : ''}assignments found.
            </div>
          )}
          {!assignmentsLoading && filteredAssignments.length > 0 && (
            <div className="rounded-xl border border-neutral-800 overflow-hidden">
              <div className="divide-y divide-neutral-800/60">
                {filteredAssignments.map((a) => {
                  const isOverdue = a.due_at && new Date(a.due_at) < new Date()
                  const urgency = (a.meta as any)?.threshold_band || (a.meta as any)?.urgency
                  return (
                    <div key={a.id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-white truncate">{a.title || 'Untitled assignment'}</span>
                          {urgency && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border uppercase tracking-wide font-semibold ${urgencyBadgeClass(urgency)}`}>
                              {urgency}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
                          <span>{a.type || 'assignment'}</span>
                          {a.due_at && (
                            <span className={isOverdue ? 'text-red-400' : ''}>
                              {isOverdue ? 'Overdue · ' : 'Due '}{new Date(a.due_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      {a.rep_id && (
                        <Link href={`/reps/${a.rep_id}`} className="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800 shrink-0 transition-colors">
                          Rep →
                        </Link>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <Link href="/admin/assignments" className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-900 transition-colors">
              Full Assignment Manager →
            </Link>
            <button type="button" onClick={loadAssignments} className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-900 transition-colors">
              Refresh
            </button>
          </div>
        </div>
      )}

      {/* ── REPLAY QUEUE ── */}
      {tab === 'replay' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-xs text-neutral-500">Show calls scored</span>
            <FilterBar
              options={REPLAY_THRESHOLDS}
              value={replayThreshold}
              onChange={setReplayThreshold}
              count={replayLoading ? undefined : filteredCalls.length}
              countLabel="calls"
            />
          </div>
          {replayLoading && <LoadingText text="Loading calls…" />}
          {!replayLoading && filteredCalls.length === 0 && (
            <div className="rounded-xl border border-neutral-800 px-4 py-5 text-sm text-neutral-400">
              No scored calls below {replayThreshold} found.
            </div>
          )}
          {!replayLoading && filteredCalls.length > 0 && (
            <div className="rounded-xl border border-neutral-800 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
                <div className="text-sm font-medium text-white">Calls for Coaching Review</div>
                <span className="text-xs text-neutral-500">Lowest score first</span>
              </div>
              <div className="divide-y divide-neutral-800/60">
                {filteredCalls.slice(0, 30).map((call) => {
                  const hasFlags = Array.isArray(call.flags) && call.flags.length > 0
                  return (
                    <div key={call.id} className="px-4 py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white truncate">{call.filename || `Call ${call.id.slice(0, 8)}…`}</span>
                          {hasFlags && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 uppercase tracking-wide font-semibold shrink-0">
                              Flagged
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-neutral-500">
                          {call.rep_name || 'Unknown rep'} · {new Date(call.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <ScorePill score={call.score_overall} className="shrink-0" />
                      <Link href={`/calls/${call.id}`} className="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800 shrink-0 transition-colors">
                        Review →
                      </Link>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <Link href="/call-library" className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-900 transition-colors">
              Full Call Library →
            </Link>
            <button type="button" onClick={loadReplay} className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-900 transition-colors">
              Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
