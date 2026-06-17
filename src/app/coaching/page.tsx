'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { WorkspaceTabs } from '@/components/shell/workspace-tabs'
import { proxyFetch } from '@/lib/api'
import { StatCard } from '@/components/ui/stat-card'
import { RiskBadge, ScorePill, StatusBadge, UrgencyBadge } from '@/components/ui/status-badge'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyRow } from '@/components/ui/empty-state'
import { LoadingText } from '@/components/ui/loading-skeleton'
import { FilterBar, FilterOption } from '@/components/ui/filter-bar'

type CoachingTab = 'overview' | 'interventions' | 'assignments' | 'replay' | 'review'
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
  completed_at?: string | null
  target_id?: string | null
  source?: string | null
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

// Sprint 4 Day 90 — aggregate payload from GET /v1/manager/command-centre
type CommandCentre = {
  teamHealth: {
    status: 'green' | 'amber' | 'red'
    averageScore: number
    reviewedCalls: number
    callsNeedingReview: number
    openAssignments: number
    overdueAssignments: number
  }
  repsNeedingAttention: Array<{
    repId: string
    repName: string
    averageScore: number
    riskLevel: 'green' | 'amber' | 'red'
    riskReason: string
    recommendedAction: string
  }>
  callsNeedingReview: Array<{
    callId: string
    repId?: string | null
    repName: string
    title: string
    overallScore: number
    weakestSkill: string
    createdAt: string
  }>
  openAssignments: Array<{
    assignmentId: string
    repId?: string | null
    repName: string
    title: string
    status: 'open' | 'overdue' | 'completed' | 'reviewed'
    dueAt: string | null
    priority: 'low' | 'medium' | 'high'
    type?: string
    source?: string
    sourceCallId?: string | null
    originLabel?: string
    notes?: string | null
  }>
  weakestSkills: Array<{
    skill: string
    count: number
    averageScore: number
    previousAverageScore?: number | null
    delta?: number | null
    trend?: 'up' | 'down' | 'flat' | 'new'
    trendLabel?: string
  }>
  coachingImpact?: {
    completedAssignments: number
    skillsImproving: number
    skillsDeclining: number
    summary: string
  }
  roi: {
    callsReviewed: number
    estimatedMinutesSaved: number
    estimatedHoursSaved: number
  }
}

const RISK_LEVEL_TO_BAND: Record<string, string> = {
  red: 'at_risk',
  amber: 'watch',
  green: 'healthy',
}

const TEAM_HEALTH_LABELS: Record<string, string> = {
  green: 'Healthy',
  amber: 'Needs attention',
  red: 'At risk',
}

// Sprint 4 Day 91 — GET /v1/manager/review-queue
type ReviewQueueItem = {
  callId: string
  repId: string | null
  repName: string
  title: string
  overallScore: number
  weakestSkill: string
  createdAt: string
  reasons: string[]
}

type ReviewNotice = { type: 'success' | 'error'; text: string }

// Tier 2B Day 119 — custom whisperer trigger library
type CustomTrigger = {
  id: string
  name: string
  type: string
  matchPhrases: string[]
  matchKeywords: string[]
  suggestionTitle: string
  suggestionResponse: string
  urgency: string
  emoji: string | null
  enabled: boolean
  priority: number
}

// Tier 2B Day 130 — read-only AI Trigger Discovery candidate (no activation)
type TriggerCandidate = {
  id: string
  type: string
  title: string
  suggestedName: string
  suggestedDescription: string
  suggestedPhrases: string[]
  suggestedKeywords: string[]
  suggestedResponse: string
  suggestedUrgency: string
  confidence: number
  seenCount: number
  examples: Array<{ text: string; sessionId: string | null; detectedAt: string | null }>
  reason: string
  status: string
}

// Tier 2B Day 114 — GET /v1/manager/whisperer-sessions
type WhispererItem = {
  sessionId: string
  repId: string | null
  repName: string
  status: 'active' | 'ended' | 'stale' | 'unknown'
  isStale?: boolean
  startedAt: string
  endedAt: string | null
  triggerCount: number
  topTriggerTypes: Array<{ type: string; count: number }>
  avgLatencyMs: number | null
  p95LatencyMs: number | null
  latestSuggestion: { type: string; title: string; urgency: string; phrase: string | null; createdAt: string } | null
  source: string
}
type WhispererInsights = {
  ok: boolean
  persistence: boolean
  items: WhispererItem[]
  summary: {
    sessionCount: number
    triggerCount: number
    topTriggerTypes: Array<{ type: string; count: number }>
    avgLatencyMs: number | null
    activeSessions: number
    staleSessions?: number
    endedSessions: number
    // Day 122 — suggestion quality signal
    suggestionOutcomes?: { used: number; ignored: number; notRelevant: number; unrated: number }
    usedRate?: number | null
    // Day 124 — usefulness breakdown
    usefulnessByType?: Array<{ type: string; shown: number; used: number; ignored: number; notRelevant: number; unrated: number; usedRate: number | null }>
    customVsBuiltIn?: {
      custom: { shown: number; used: number; ignored: number; notRelevant: number; unrated: number; usedRate: number | null }
      builtIn: { shown: number; used: number; ignored: number; notRelevant: number; unrated: number; usedRate: number | null }
    }
    // Day 125 — noisy custom trigger health flags
    customTriggerHealth?: {
      needsEditing: Array<{ type: string; shown: number; used: number; ignored: number; notRelevant: number; unrated: number; usedRate: number | null; reason: string; severity: string }>
    }
  }
}

// Tier 2A Day 105 — GET /v1/manager/sparring-sessions
type RecentSparringItem = {
  sessionId: string
  repId: string | null
  repName: string
  assignmentId: string | null
  persona: string | null
  difficulty: string
  overall: number
  weakestDimension: string
  strongestDimension: string
  recommendedDrill: { type: string; title: string; reason: string } | null
  summaryText: string
  nextBestAction: string
  completedAt: string | null
  turnCount: number
  source: 'assignment' | 'manual' | 'unknown'
}

// ── Sprint 4 Day 92 — Assign Coaching from a call (rule-based pre-fill) ──────

const SKILL_TO_TITLE: Record<string, string> = {
  Intro: 'Opening Script Practice',
  Discovery: 'Discovery Drill',
  Pitch: 'Pitch Clarity Drill',
  Objection: 'Objection Handling Drill',
  Close: 'Closing Drill',
}

const SKILL_TO_SECTION: Record<string, string> = {
  Intro: 'intro',
  Discovery: 'discovery',
  Pitch: 'pitch',
  Objection: 'objection',
  Close: 'close',
}

function coachingTitleFor(weakestSkill: string): string {
  return SKILL_TO_TITLE[weakestSkill] ?? 'Call Review Coaching'
}

function coachingNoteFor(weakestSkill: string, reasons: string[]): string {
  const parts: string[] = []
  if (reasons.some((r) => r.startsWith('Score below'))) {
    parts.push('This call was flagged because the overall score was below target.')
  }
  if (weakestSkill && weakestSkill !== 'Unknown') {
    parts.push(`Focus on the weakest skill: ${weakestSkill}.`)
  }
  parts.push('Review the call and complete the recommended practice.')
  return parts.join(' ')
}

function coachingPriorityFor(overallScore: number, reasons: string[]): 'low' | 'medium' | 'high' {
  if (overallScore < 50) return 'high'
  if (overallScore < 70 || reasons.some((r) => / below 50$/.test(r))) return 'medium'
  return 'low'
}

function defaultDueYmd(): string {
  return new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
}

type AssignDraft = {
  callId: string
  repId: string
  repName: string
  weakestSkill: string
  overallScore: number
  reasons: string[]
  title: string
  note: string
  dueYmd: string
  priority: 'low' | 'medium' | 'high'
}

type AssignmentFilter = 'open' | 'overdue' | 'completed' | 'all'
type ReplayThreshold = '70' | '60' | '50'

const ASSIGNMENT_FILTERS: FilterOption<AssignmentFilter>[] = [
  { value: 'open', label: 'Open' },
  { value: 'overdue', label: 'Overdue', variant: 'danger' },
  { value: 'completed', label: 'Completed' },
  { value: 'all', label: 'All' },
]

const ASSIGNMENT_EMPTY_COPY: Record<AssignmentFilter, string> = {
  open: 'No open coaching assignments.',
  overdue: 'No overdue coaching assignments.',
  completed: 'No completed coaching assignments yet.',
  all: 'No assignments found.',
}

// ── Day 93 — assignment tracking helpers (mirror /v1/manager rules) ─────────

function assignmentOriginLabel(a: Assignment): string {
  const src = String(a.source || a.meta?.assignment_origin || '').toLowerCase()
  if (src === 'manager_review') return 'Assigned via review'
  if (src.includes('auto')) return 'Auto-created'
  if (src) return 'Manual assignment'
  return ''
}

function assignmentPriorityOf(a: Assignment): 'low' | 'medium' | 'high' {
  const stored = String(a.meta?.priority || '').toLowerCase()
  if (stored === 'low' || stored === 'medium' || stored === 'high') return stored
  if (!a.due_at) return 'low'
  const dueMs = new Date(a.due_at).getTime()
  if (!Number.isFinite(dueMs)) return 'low'
  const now = Date.now()
  if (dueMs < now) return 'high'
  if (dueMs < now + 24 * 3600 * 1000) return 'medium'
  return 'low'
}

function assignmentSourceCallIdOf(a: Assignment): string | null {
  const fromMeta = String(a.meta?.source_call_id || '').trim()
  if (fromMeta) return fromMeta
  if (String(a.type || '') === 'call_review' && a.target_id) return String(a.target_id)
  return null
}

const PRIORITY_BADGE_CLS: Record<'low' | 'medium' | 'high', string> = {
  high: 'border-red-500/30 bg-red-500/10 text-red-300',
  medium: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  low: 'border-neutral-700 bg-neutral-900 text-neutral-400',
}

function dueLabelOf(a: Assignment): { text: string; cls: string } | null {
  if (!a.due_at) return null
  const due = new Date(a.due_at)
  if (!Number.isFinite(due.getTime())) return null
  const isCompleted = String(a.status || '') === 'completed'
  if (isCompleted) return { text: `Due ${due.toLocaleDateString('en-GB')}`, cls: '' }
  const now = new Date()
  if (due.getTime() < now.getTime()) return { text: `Overdue · ${due.toLocaleDateString('en-GB')}`, cls: 'text-red-400' }
  if (due.toDateString() === now.toDateString()) return { text: 'Due today', cls: 'text-amber-300' }
  return { text: `Due ${due.toLocaleDateString('en-GB')}`, cls: '' }
}

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
  const [commandCentre, setCommandCentre] = useState<CommandCentre | null>(null)
  const [commandCentreError, setCommandCentreError] = useState<string | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [overviewError, setOverviewError] = useState<string | null>(null)

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [assignmentsLoading, setAssignmentsLoading] = useState(false)
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>('open')

  const [calls, setCalls] = useState<CallItem[]>([])
  const [replayLoading, setReplayLoading] = useState(false)
  const [replayThreshold, setReplayThreshold] = useState<ReplayThreshold>('70')

  // Recent sparring (Tier 2A Day 105)
  const [recentSparring, setRecentSparring] = useState<RecentSparringItem[]>([])
  const [sparringLoading, setSparringLoading] = useState(true)
  const [sparringError, setSparringError] = useState<string | null>(null)

  // Whisperer insights (Tier 2B Day 114)
  const [whisperer, setWhisperer] = useState<WhispererInsights | null>(null)
  const [whispererLoading, setWhispererLoading] = useState(true)
  const [whispererError, setWhispererError] = useState(false)

  // Custom whisperer triggers (Tier 2B Day 119)
  const [customTriggers, setCustomTriggers] = useState<CustomTrigger[]>([])
  const [customTriggersPersistence, setCustomTriggersPersistence] = useState(true)
  const [showTriggerForm, setShowTriggerForm] = useState(false)
  const [triggerDraft, setTriggerDraft] = useState({
    name: '', type: 'competitor', matchPhrases: '', matchKeywords: '',
    suggestionTitle: '', suggestionResponse: '', urgency: 'medium', enabled: true,
  })
  const [savingTrigger, setSavingTrigger] = useState(false)
  const [triggerNotice, setTriggerNotice] = useState<string | null>(null)

  // Tier 2B Day 130 — Suggested Trigger Candidates (read-only discovery)
  const [triggerCandidates, setTriggerCandidates] = useState<TriggerCandidate[]>([])
  const [candidatesLoading, setCandidatesLoading] = useState(true)
  const [candidatesError, setCandidatesError] = useState(false)
  const [expandedCandidateId, setExpandedCandidateId] = useState<string | null>(null)
  // Day 131: remembers which candidate (if any) prefilled the form, for the
  // success notice. Cleared on save/cancel. Nothing activates until save.
  const [candidateSourceId, setCandidateSourceId] = useState<string | null>(null)
  // Day 132/133: hidden candidates. Local set hides immediately; Day 133 also
  // persists the decision server-side so it stays hidden across refreshes.
  const [dismissedCandidateIds, setDismissedCandidateIds] = useState<string[]>([])
  const [candidateNotice, setCandidateNotice] = useState<string | null>(null)

  // Day 133: persist a manager decision for a candidate. Fail-soft: a missing
  // migration still hides the candidate for this session.
  const postCandidateDecision = useCallback(async (
    candidateId: string,
    decision: 'approved' | 'dismissed' | 'rejected',
    opts: { candidateType?: string; source?: Record<string, unknown> } = {}
  ): Promise<'ok' | 'migration_required' | 'error'> => {
    try {
      const res = await proxyFetch(`/v1/manager/whisperer-trigger-candidates/${encodeURIComponent(candidateId)}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision, ...(opts.candidateType ? { candidateType: opts.candidateType } : {}), ...(opts.source ? { source: opts.source } : {}) }),
      })
      const data = await res.json().catch(() => ({}))
      return data?.ok ? 'ok' : data?.error === 'migration_required' ? 'migration_required' : 'error'
    } catch {
      return 'error'
    }
  }, [])

  // Dismiss/reject: optimistically hide, then persist the decision.
  const decideCandidate = useCallback(async (c: TriggerCandidate, decision: 'dismissed' | 'rejected') => {
    setDismissedCandidateIds((prev) => (prev.includes(c.id) ? prev : [...prev, c.id]))
    const r = await postCandidateDecision(c.id, decision, {
      candidateType: c.type,
      source: { title: c.suggestedName, seenCount: c.seenCount, confidence: c.confidence },
    })
    setCandidateNotice(
      r === 'ok'
        ? decision === 'rejected' ? 'Candidate rejected.' : 'Candidate dismissed.'
        : r === 'migration_required'
          ? 'Hidden for now (decision persistence not enabled yet).'
          : 'Hidden for now (could not save decision).'
    )
  }, [postCandidateDecision])

  // Manager review queue (Sprint 4 Day 91)
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([])
  const [reviewQueueLoading, setReviewQueueLoading] = useState(false)
  const [reviewQueueError, setReviewQueueError] = useState<string | null>(null)
  const [reviewQueueLoaded, setReviewQueueLoaded] = useState(false)
  const [markingReviewedId, setMarkingReviewedId] = useState<string | null>(null)
  const [reviewNotice, setReviewNotice] = useState<ReviewNotice | null>(null)

  // Assign Coaching modal (Sprint 4 Day 92)
  const [assignDraft, setAssignDraft] = useState<AssignDraft | null>(null)
  const [assigning, setAssigning] = useState(false)

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true)
    setOverviewError(null)
    try {
      const [ccRes, repRes, mccData] = await Promise.all([
        proxyFetch('/v1/crm/manager/control-centre?days=7&limit=20', { cache: 'no-store' }),
        proxyFetch('/v1/dashboard/reporting-summary?days=7', { cache: 'no-store' }),
        // Sprint 4 aggregate — fail-soft so the rest of the overview still renders
        proxyFetch('/v1/manager/command-centre?days=30', { cache: 'no-store' })
          .then((r) => r.json())
          .catch(() => null),
      ])
      const ccData = await ccRes.json()
      const repData = await repRes.json().catch(() => ({}))
      if (mccData?.ok && mccData.teamHealth) {
        setCommandCentre(mccData as CommandCentre)
        setCommandCentreError(null)
      } else {
        setCommandCentre(null)
        setCommandCentreError(mccData?.error || 'Unable to load team health data')
      }
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
      // Day 93: manager-scoped list (hierarchy-filtered) instead of the
      // requester's own assignments — this tab is a manager tracking view.
      const res = await proxyFetch('/v1/assignments/manager?limit=100', { cache: 'no-store' })
      const data = await res.json()
      setAssignments(data.items ?? data.assignments ?? [])
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

  const loadReviewQueue = useCallback(async () => {
    setReviewQueueLoading(true)
    setReviewQueueError(null)
    try {
      const res = await proxyFetch('/v1/manager/review-queue?days=30&limit=25', { cache: 'no-store' })
      const data = await res.json()
      if (data?.ok) {
        setReviewQueue(data.items ?? [])
      } else {
        setReviewQueue([])
        setReviewQueueError(data?.error || 'Failed to load the review queue')
      }
    } catch (e: any) {
      setReviewQueue([])
      setReviewQueueError(e?.message || 'Connection error')
    } finally {
      setReviewQueueLoading(false)
      setReviewQueueLoaded(true)
    }
  }, [])

  const markReviewed = useCallback(async (callId: string) => {
    setMarkingReviewedId(callId)
    setReviewNotice(null)
    try {
      const res = await proxyFetch(`/v1/calls/${encodeURIComponent(callId)}/manager-review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => ({}))
      if (data?.ok) {
        setReviewNotice({ type: 'success', text: 'Call marked as reviewed.' })
        // Refresh both the command-centre payload and the queue
        loadOverview()
        loadReviewQueue()
      } else if (data?.error === 'migration_required') {
        setReviewNotice({ type: 'error', text: data?.hint || 'Review history migration required.' })
      } else {
        setReviewNotice({ type: 'error', text: 'Could not mark this call as reviewed.' })
      }
    } catch {
      setReviewNotice({ type: 'error', text: 'Could not mark this call as reviewed.' })
    } finally {
      setMarkingReviewedId(null)
    }
  }, [loadOverview, loadReviewQueue])

  const openAssignCoaching = useCallback((call: {
    callId: string
    repId?: string | null
    repName: string
    overallScore: number
    weakestSkill: string
    reasons?: string[]
  }) => {
    setReviewNotice(null)
    if (!call.repId) {
      setReviewNotice({ type: 'error', text: 'Could not assign coaching because this call is not linked to a rep.' })
      return
    }
    const reasons = call.reasons ?? (call.overallScore < 70 ? ['Score below 70'] : [])
    setAssignDraft({
      callId: call.callId,
      repId: call.repId,
      repName: call.repName,
      weakestSkill: call.weakestSkill,
      overallScore: call.overallScore,
      reasons,
      title: coachingTitleFor(call.weakestSkill),
      note: coachingNoteFor(call.weakestSkill, reasons),
      dueYmd: defaultDueYmd(),
      priority: coachingPriorityFor(call.overallScore, reasons),
    })
  }, [])

  const submitAssignCoaching = useCallback(async () => {
    if (!assignDraft || assigning) return
    if (assignDraft.title.trim().length < 3) {
      setReviewNotice({ type: 'error', text: 'Coaching title must be at least 3 characters.' })
      return
    }
    setAssigning(true)
    setReviewNotice(null)
    try {
      const res = await proxyFetch('/v1/assignments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          rep_id: assignDraft.repId,
          type: 'call_review',
          target_id: assignDraft.callId,
          title: assignDraft.title.trim(),
          due_at: new Date(`${assignDraft.dueYmd}T12:00:00Z`).toISOString(),
          source: 'manager_review',
          notes: assignDraft.note.trim() || null,
          meta: {
            assignment_origin: 'manager_review',
            flag_section: SKILL_TO_SECTION[assignDraft.weakestSkill] ?? 'general',
            score_before: assignDraft.overallScore,
            priority: assignDraft.priority,
            source_call_id: assignDraft.callId,
            review_reasons: assignDraft.reasons,
          },
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (data?.ok && data?.skipped) {
        setReviewNotice({ type: 'error', text: 'Not assigned — this rep already has an active drill for this skill.' })
        setAssignDraft(null)
      } else if (data?.ok) {
        setReviewNotice({ type: 'success', text: 'Coaching assigned.' })
        setAssignDraft(null)
        loadOverview()
        loadAssignments()
      } else {
        setReviewNotice({ type: 'error', text: data?.error ? `Could not assign coaching (${data.error}).` : 'Could not assign coaching.' })
      }
    } catch {
      setReviewNotice({ type: 'error', text: 'Could not assign coaching.' })
    } finally {
      setAssigning(false)
    }
  }, [assignDraft, assigning, loadOverview, loadAssignments])

  const loadRecentSparring = useCallback(async () => {
    setSparringLoading(true)
    setSparringError(null)
    try {
      const res = await proxyFetch('/v1/manager/sparring-sessions?days=30&limit=5', { cache: 'no-store' })
      const data = await res.json()
      if (data?.ok) {
        setRecentSparring(data.items ?? [])
      } else {
        setRecentSparring([])
        setSparringError(data?.error || 'Could not load recent sparring.')
      }
    } catch {
      setRecentSparring([])
      setSparringError('Could not load recent sparring.')
    } finally {
      setSparringLoading(false)
    }
  }, [])

  const loadWhisperer = useCallback(async () => {
    setWhispererLoading(true)
    setWhispererError(false)
    try {
      const res = await proxyFetch('/v1/manager/whisperer-sessions?days=30&limit=5', { cache: 'no-store' })
      const data = await res.json()
      // Require the full shape — a bare {ok:true} (e.g. mocked catch-all) is treated as empty
      if (data?.ok && Array.isArray(data.items) && data.summary) setWhisperer(data)
      else setWhisperer(null)
    } catch {
      setWhisperer(null); setWhispererError(true)
    } finally {
      setWhispererLoading(false)
    }
  }, [])

  const loadCustomTriggers = useCallback(async () => {
    try {
      const res = await proxyFetch('/v1/manager/whisperer-trigger-library', { cache: 'no-store' })
      const data = await res.json()
      if (data?.ok) {
        setCustomTriggers(data.items ?? [])
        setCustomTriggersPersistence(data.persistence !== false)
      }
    } catch { /* fail-soft */ }
  }, [])

  // Day 131: prefill the existing Custom Trigger form from a candidate. This
  // does NOT activate anything — the manager must review and click Save.
  const useCandidate = useCallback((c: TriggerCandidate) => {
    setTriggerDraft({
      name: c.suggestedName,
      type: c.type,
      matchPhrases: c.suggestedPhrases.join(', '),
      matchKeywords: c.suggestedKeywords.join(', '),
      suggestionTitle: c.title || c.suggestedName,
      suggestionResponse: c.suggestedResponse,
      urgency: c.suggestedUrgency || 'medium',
      enabled: true,
    })
    setCandidateSourceId(c.id)
    setShowTriggerForm(true)
    setTriggerNotice('Candidate loaded into Custom Trigger form. Review and save to activate.')
    // Day 132: hide the loaded candidate locally to reduce clutter.
    setDismissedCandidateIds((prev) => (prev.includes(c.id) ? prev : [...prev, c.id]))
    if (typeof document !== 'undefined') {
      document.getElementById('custom-triggers')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  // Day 130: read-only AI Trigger Discovery candidates (no activation here).
  const loadTriggerCandidates = useCallback(async () => {
    setCandidatesLoading(true)
    setCandidatesError(false)
    try {
      const res = await proxyFetch('/v1/manager/whisperer-trigger-candidates?days=30&limit=10', { cache: 'no-store' })
      const data = await res.json()
      if (data?.ok && Array.isArray(data.items)) setTriggerCandidates(data.items)
      else { setTriggerCandidates([]); setCandidatesError(true) }
    } catch {
      setTriggerCandidates([]); setCandidatesError(true)
    } finally {
      setCandidatesLoading(false)
    }
  }, [])

  const submitTrigger = useCallback(async () => {
    if (savingTrigger) return
    setSavingTrigger(true)
    setTriggerNotice(null)
    try {
      const res = await proxyFetch('/v1/manager/whisperer-trigger-library', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: triggerDraft.name.trim(),
          type: triggerDraft.type,
          matchPhrases: triggerDraft.matchPhrases.split(',').map((s) => s.trim()).filter(Boolean),
          matchKeywords: triggerDraft.matchKeywords.split(',').map((s) => s.trim()).filter(Boolean),
          suggestionTitle: triggerDraft.suggestionTitle.trim(),
          suggestionResponse: triggerDraft.suggestionResponse.trim(),
          urgency: triggerDraft.urgency,
          enabled: triggerDraft.enabled,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (data?.ok) {
        setTriggerNotice(candidateSourceId ? 'Custom trigger created from candidate.' : 'Custom trigger saved.')
        setShowTriggerForm(false)
        // Day 133: only mark the candidate approved AFTER a successful save, then
        // refetch so the now-actioned candidate drops out of the list.
        if (candidateSourceId) {
          void postCandidateDecision(candidateSourceId, 'approved').then(() => loadTriggerCandidates())
        }
        setCandidateSourceId(null)
        setTriggerDraft({ name: '', type: 'competitor', matchPhrases: '', matchKeywords: '', suggestionTitle: '', suggestionResponse: '', urgency: 'medium', enabled: true })
        loadCustomTriggers()
      } else if (data?.error === 'migration_required') {
        setTriggerNotice('Custom triggers are not enabled yet (migration required).')
      } else {
        setTriggerNotice(`Could not save trigger${data?.error ? ` (${data.error})` : ''}.`)
      }
    } catch {
      setTriggerNotice('Could not save trigger.')
    } finally {
      setSavingTrigger(false)
    }
  }, [triggerDraft, savingTrigger, loadCustomTriggers, candidateSourceId, postCandidateDecision, loadTriggerCandidates])

  const [triggerActioningId, setTriggerActioningId] = useState<string | null>(null)

  const toggleTrigger = useCallback(async (id: string, enabled: boolean) => {
    setTriggerActioningId(id)
    setTriggerNotice(null)
    try {
      const res = await proxyFetch(`/v1/manager/whisperer-trigger-library/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      const data = await res.json().catch(() => ({}))
      if (data?.ok) {
        setTriggerNotice(enabled ? 'Trigger enabled.' : 'Trigger disabled.')
        loadCustomTriggers()
      } else {
        setTriggerNotice('Could not update trigger.')
      }
    } catch {
      setTriggerNotice('Could not update trigger.')
    } finally {
      setTriggerActioningId(null)
    }
  }, [loadCustomTriggers])

  const deleteTrigger = useCallback(async (id: string, name: string) => {
    if (typeof window !== 'undefined' && !window.confirm(`Delete the custom trigger "${name}"?`)) return
    setTriggerActioningId(id)
    setTriggerNotice(null)
    try {
      const res = await proxyFetch(`/v1/manager/whisperer-trigger-library/${encodeURIComponent(id)}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (data?.ok) {
        setTriggerNotice('Trigger deleted.')
        loadCustomTriggers()
      } else {
        setTriggerNotice('Could not delete trigger.')
      }
    } catch {
      setTriggerNotice('Could not delete trigger.')
    } finally {
      setTriggerActioningId(null)
    }
  }, [loadCustomTriggers])

  useEffect(() => { loadOverview() }, [loadOverview])
  useEffect(() => { loadRecentSparring() }, [loadRecentSparring])
  useEffect(() => { loadWhisperer() }, [loadWhisperer])
  useEffect(() => { loadCustomTriggers() }, [loadCustomTriggers])
  useEffect(() => { loadTriggerCandidates() }, [loadTriggerCandidates])
  useEffect(() => {
    if (tab === 'assignments' && assignments.length === 0) loadAssignments()
    if (tab === 'replay' && calls.length === 0) loadReplay()
    if (tab === 'review' && !reviewQueueLoaded) loadReviewQueue()
  }, [tab, assignments.length, calls.length, reviewQueueLoaded, loadAssignments, loadReplay, loadReviewQueue])

  const filteredAssignments = assignments.filter((a) => {
    if (assignmentFilter === 'open') return a.status === 'open' || a.status === 'assigned'
    if (assignmentFilter === 'overdue') {
      if (!a.due_at) return false
      return new Date(a.due_at) < new Date() && (a.status === 'open' || a.status === 'assigned')
    }
    if (assignmentFilter === 'completed') return a.status === 'completed'
    return true
  })

  const repNameById = useMemo(
    () => new Map(reps.map((r) => [String(r.rep_id), r.rep_name])),
    [reps]
  )

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
          { id: 'review', label: 'Review Queue', badge: commandCentre?.teamHealth.callsNeedingReview || undefined },
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
              {/* ── Sprint 4: Manager Command Centre (GET /v1/manager/command-centre) ── */}
              {commandCentreError && !commandCentre && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">
                  Team health unavailable: {commandCentreError}
                </div>
              )}

              {reviewNotice && (
                <div
                  className={`rounded-xl border px-4 py-3 text-sm ${
                    reviewNotice.type === 'success'
                      ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
                      : 'border-red-500/30 bg-red-500/5 text-red-300'
                  }`}
                >
                  {reviewNotice.text}
                </div>
              )}

              {commandCentre && (
                <>
                  {/* Team Health */}
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                    <StatCard
                      label="Team Health"
                      value={TEAM_HEALTH_LABELS[commandCentre.teamHealth.status] ?? commandCentre.teamHealth.status}
                      subtext="last 30 days"
                      variant={commandCentre.teamHealth.status === 'red' ? 'danger' : commandCentre.teamHealth.status === 'amber' ? 'warning' : 'success'}
                    />
                    <StatCard
                      label="Average Score"
                      value={commandCentre.teamHealth.averageScore}
                      subtext="team average"
                      variant={commandCentre.teamHealth.averageScore < 55 ? 'danger' : commandCentre.teamHealth.averageScore < 70 ? 'warning' : 'success'}
                    />
                    <StatCard label="Reviewed Calls" value={commandCentre.teamHealth.reviewedCalls} subtext="scored this period" />
                    <StatCard
                      label="Calls Needing Review"
                      value={commandCentre.teamHealth.callsNeedingReview}
                      variant={commandCentre.teamHealth.callsNeedingReview > 0 ? 'warning' : 'default'}
                    />
                    <StatCard label="Open Coaching" value={commandCentre.teamHealth.openAssignments} subtext="assignments" />
                    <StatCard
                      label="Overdue"
                      value={commandCentre.teamHealth.overdueAssignments}
                      subtext="assignments"
                      variant={commandCentre.teamHealth.overdueAssignments > 0 ? 'danger' : 'default'}
                    />
                  </div>

                  {/* Reps / Calls / Assignments */}
                  <div className="grid gap-4 xl:grid-cols-3">
                    <SectionCard title="Reps Needing Attention" subtitle="Rule-based risk from the last 30 days.">
                      {commandCentre.repsNeedingAttention.length === 0 ? (
                        <EmptyRow message="No reps need attention right now." />
                      ) : (
                        <div className="space-y-2">
                          {commandCentre.repsNeedingAttention.map((rep) => (
                            <div key={rep.repId} className="rounded-lg border border-neutral-800 bg-neutral-900/30 px-3 py-2.5 space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium text-white truncate">{rep.repName}</span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <ScorePill score={rep.averageScore} />
                                  <RiskBadge band={RISK_LEVEL_TO_BAND[rep.riskLevel] ?? rep.riskLevel} />
                                </div>
                              </div>
                              <div className="text-[11px] text-neutral-500">{rep.riskReason}</div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-amber-300 truncate">{rep.recommendedAction}</span>
                                <Link
                                  href={`/crm/reps/${rep.repId}`}
                                  className="shrink-0 rounded-md bg-indigo-600/20 px-2 py-1 text-xs font-semibold text-indigo-200 hover:bg-indigo-600/30 transition-colors"
                                >
                                  Open Rep
                                </Link>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </SectionCard>

                    <SectionCard title="Calls Needing Review" subtitle="Lowest scores first · score below 70 or a critical section.">
                      {commandCentre.callsNeedingReview.length === 0 ? (
                        <EmptyRow message="No calls need review right now." />
                      ) : (
                        <div className="space-y-2">
                          {commandCentre.callsNeedingReview.map((call) => (
                            <div key={call.callId} className="rounded-lg border border-neutral-800 bg-neutral-900/30 px-3 py-2.5 space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium text-white truncate">{call.title}</span>
                                <ScorePill score={call.overallScore} className="shrink-0" />
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-neutral-500">
                                <span>{call.repName}</span>
                                <span>Weakest: <span className="text-neutral-300">{call.weakestSkill}</span></span>
                                {call.createdAt && <span>{new Date(call.createdAt).toLocaleDateString('en-GB')}</span>}
                              </div>
                              <div className="flex items-center gap-2">
                                <Link
                                  href={`/calls/${call.callId}`}
                                  className="rounded-md bg-indigo-600/20 px-2 py-1 text-xs font-semibold text-indigo-200 hover:bg-indigo-600/30 transition-colors"
                                >
                                  Review Call
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => markReviewed(call.callId)}
                                  disabled={markingReviewedId === call.callId}
                                  className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800 transition-colors disabled:opacity-50"
                                >
                                  {markingReviewedId === call.callId ? 'Marking…' : 'Mark Reviewed'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openAssignCoaching(call)}
                                  className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-colors"
                                >
                                  Assign Coaching
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </SectionCard>

                    <SectionCard title="Open Coaching" subtitle="Overdue first, then nearest due date.">
                      {commandCentre.openAssignments.length === 0 ? (
                        <EmptyRow message="No open coaching assignments." />
                      ) : (
                        <div className="space-y-2">
                          {commandCentre.openAssignments.map((a) => (
                            <div key={a.assignmentId} className="rounded-lg border border-neutral-800 bg-neutral-900/30 px-3 py-2.5 space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium text-white truncate">{a.title}</span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <UrgencyBadge urgency={a.priority} />
                                  <StatusBadge status={a.status} />
                                </div>
                              </div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[11px] text-neutral-500 truncate">
                                  {a.repName}
                                  {a.originLabel === 'Assigned via review' ? ' · Assigned via review' : ''}
                                  {a.dueAt ? ` · due ${new Date(a.dueAt).toLocaleDateString('en-GB')}` : ''}
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {a.sourceCallId && (
                                    <Link
                                      href={`/calls/${a.sourceCallId}`}
                                      className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800 transition-colors"
                                    >
                                      From call
                                    </Link>
                                  )}
                                  <Link
                                    href="/admin/assignments"
                                    className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800 transition-colors"
                                  >
                                    Open Assignment
                                  </Link>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </SectionCard>
                  </div>

                  {/* Weakest Skills + ROI */}
                  <div className="grid gap-4 xl:grid-cols-3">
                    <SectionCard title="Weakest Skills" subtitle="Stage scores across reviewed calls." className="xl:col-span-2">
                      {commandCentre.weakestSkills.length === 0 ? (
                        <EmptyRow message="No skill data available yet." />
                      ) : (
                        <div className="space-y-3">
                          {commandCentre.weakestSkills.map((s) => (
                            <div key={s.skill} className="space-y-1">
                              <div className="flex items-center justify-between gap-2 text-sm">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-neutral-200">{s.skill}</span>
                                  {s.trendLabel && (
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border shrink-0 ${
                                      s.trend === 'up'
                                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                        : s.trend === 'down'
                                          ? 'border-red-500/30 bg-red-500/10 text-red-300'
                                          : 'border-neutral-700 bg-neutral-900 text-neutral-400'
                                    }`}>
                                      {s.trendLabel}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[10px] text-neutral-500">{s.count} weak {s.count === 1 ? 'call' : 'calls'}</span>
                                  <ScorePill score={s.averageScore} />
                                </div>
                              </div>
                              <div className="h-1.5 rounded-full bg-neutral-900 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${s.averageScore < 55 ? 'bg-red-400/60' : s.averageScore < 70 ? 'bg-amber-400/60' : 'bg-emerald-400/60'}`}
                                  style={{ width: `${Math.min(100, Math.max(6, s.averageScore))}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </SectionCard>

                    <div className="space-y-4">
                      <SectionCard variant="coaching" title="Estimated Manager Time Saved" subtitle="20 minutes per reviewed call.">
                        <div className="grid grid-cols-3 gap-3">
                          <StatCard label="Calls Reviewed" value={commandCentre.roi.callsReviewed} size="sm" />
                          <StatCard label="Minutes Saved" value={commandCentre.roi.estimatedMinutesSaved} size="sm" variant="success" />
                          <StatCard label="Hours Saved" value={commandCentre.roi.estimatedHoursSaved} size="sm" variant="success" />
                        </div>
                      </SectionCard>

                      {commandCentre.coachingImpact && (
                        <SectionCard variant="coaching" title="Coaching Impact" subtitle="This period vs the previous one.">
                          <div className="grid grid-cols-3 gap-3">
                            <StatCard label="Completed" value={commandCentre.coachingImpact.completedAssignments} subtext="assignments" size="sm" />
                            <StatCard
                              label="Improving"
                              value={commandCentre.coachingImpact.skillsImproving}
                              subtext="skills"
                              size="sm"
                              variant={commandCentre.coachingImpact.skillsImproving > 0 ? 'success' : 'default'}
                            />
                            <StatCard
                              label="Declining"
                              value={commandCentre.coachingImpact.skillsDeclining}
                              subtext="skills"
                              size="sm"
                              variant={commandCentre.coachingImpact.skillsDeclining > 0 ? 'danger' : 'default'}
                            />
                          </div>
                          <div className="mt-2 text-xs text-neutral-500">{commandCentre.coachingImpact.summary}</div>
                        </SectionCard>
                      )}

                      {/* Tier 2A Day 105 — Recent Sparring */}
                      <SectionCard variant="coaching" title="Recent Sparring" subtitle="Completed sessions · last 30 days.">
                        {sparringLoading && <LoadingText text="Loading recent sparring…" />}
                        {sparringError && !sparringLoading && (
                          <div className="text-sm text-red-300">Could not load recent sparring.</div>
                        )}
                        {!sparringLoading && !sparringError && recentSparring.length === 0 && (
                          <EmptyRow message="No completed sparring sessions yet." />
                        )}
                        {!sparringLoading && !sparringError && recentSparring.length > 0 && (
                          <div className="space-y-2">
                            {recentSparring.map((s) => (
                              <div key={s.sessionId} className="rounded-lg border border-neutral-800 bg-neutral-900/30 px-3 py-2.5 space-y-1.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-medium text-white truncate">{s.repName}</span>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    {s.source === 'assignment' && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 uppercase tracking-wide font-semibold">
                                        Assigned drill
                                      </span>
                                    )}
                                    <ScorePill score={s.overall} />
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-neutral-500">
                                  <span className="capitalize">{s.difficulty}</span>
                                  {s.weakestDimension !== 'unknown' && (
                                    <span>Weakest area: <span className="text-neutral-300">{s.weakestDimension}</span></span>
                                  )}
                                  {s.completedAt && <span>Completed {new Date(s.completedAt).toLocaleDateString('en-GB')}</span>}
                                </div>
                                {s.recommendedDrill?.title && (
                                  <div className="text-xs font-medium text-amber-300 truncate">
                                    Recommended drill: {s.recommendedDrill.title}
                                  </div>
                                )}
                                <div className="text-xs text-neutral-500 truncate" title={s.summaryText}>{s.summaryText}</div>
                                <Link
                                  href={`/sparring/${s.sessionId}`}
                                  className="inline-block rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-800 transition-colors"
                                >
                                  Open sparring
                                </Link>
                              </div>
                            ))}
                          </div>
                        )}
                      </SectionCard>

                      {/* Tier 2B Day 114 — Whisperer Insights */}
                      <SectionCard variant="ai" title="Whisperer Insights" subtitle="Live coaching activity · last 30 days.">
                        {whispererLoading && <LoadingText text="Loading Whisperer activity…" />}
                        {whispererError && !whispererLoading && (
                          <div className="text-sm text-red-300">Could not load Whisperer sessions.</div>
                        )}
                        {!whispererLoading && !whispererError && whisperer && whisperer.persistence === false && (
                          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                            Whisperer persistence is not enabled yet.
                          </div>
                        )}
                        {!whispererLoading && !whispererError && whisperer && whisperer.persistence !== false && whisperer.items.length === 0 && (
                          <EmptyRow message="No Whisperer sessions yet." />
                        )}
                        {!whispererLoading && !whispererError && whisperer && whisperer.items.length > 0 && (
                          <div className="space-y-3">
                            <div className="grid grid-cols-3 gap-2 text-center">
                              <div className="rounded-lg border border-neutral-800 bg-neutral-900/30 px-2 py-1.5">
                                <div className="text-sm font-semibold text-white tabular-nums">{whisperer.summary.sessionCount}</div>
                                <div className="text-[10px] text-neutral-500">sessions</div>
                              </div>
                              <div className="rounded-lg border border-neutral-800 bg-neutral-900/30 px-2 py-1.5">
                                <div className="text-sm font-semibold text-white tabular-nums">{whisperer.summary.triggerCount}</div>
                                <div className="text-[10px] text-neutral-500">triggers</div>
                              </div>
                              <div className="rounded-lg border border-neutral-800 bg-neutral-900/30 px-2 py-1.5">
                                <div className="text-sm font-semibold text-white tabular-nums">
                                  {whisperer.summary.avgLatencyMs !== null ? `${whisperer.summary.avgLatencyMs}ms` : '—'}
                                </div>
                                <div className="text-[10px] text-neutral-500">avg latency</div>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500">
                              {whisperer.summary.topTriggerTypes[0] && (
                                <span>Top objection: <span className="text-neutral-300 capitalize">{whisperer.summary.topTriggerTypes[0].type.replace('_', ' ')}</span></span>
                              )}
                              <span>
                                {whisperer.summary.activeSessions} active
                                {(whisperer.summary.staleSessions ?? 0) > 0 ? ` · ${whisperer.summary.staleSessions} stale` : ''}
                                {' · '}{whisperer.summary.endedSessions} ended
                              </span>
                            </div>
                            {(whisperer.summary.staleSessions ?? 0) > 0 && (
                              <div className="text-[10px] text-neutral-600">
                                Stale sessions are older active sessions that were not ended cleanly.
                              </div>
                            )}
                            {whisperer.summary.suggestionOutcomes && (
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500">
                                <span>
                                  Suggestion use: <span className="text-neutral-300">{whisperer.summary.suggestionOutcomes.used} used</span>
                                  {' · '}{whisperer.summary.suggestionOutcomes.ignored} ignored
                                  {' · '}{whisperer.summary.suggestionOutcomes.notRelevant} not relevant
                                </span>
                                {typeof whisperer.summary.usedRate === 'number' && (
                                  <span>Used rate: <span className="text-neutral-300">{whisperer.summary.usedRate}%</span></span>
                                )}
                              </div>
                            )}

                            {/* Day 124 — usefulness breakdown by objection type + custom vs built-in */}
                            {whisperer.summary.usefulnessByType && (
                              (() => {
                                const types = whisperer.summary.usefulnessByType!
                                const cvb = whisperer.summary.customVsBuiltIn
                                const anyRated = types.some((t) => t.usedRate !== null)
                                if (!anyRated) {
                                  return <div className="text-[11px] text-neutral-600">No suggestion ratings yet.</div>
                                }
                                return (
                                  <div className="rounded-lg border border-neutral-800 bg-neutral-900/20 px-3 py-2 space-y-1">
                                    <div className="text-[10px] uppercase tracking-wide text-neutral-500">Usefulness by objection</div>
                                    {types.slice(0, 3).map((t) => (
                                      <div key={t.type} className="text-[11px] text-neutral-400">
                                        <span className="text-neutral-300 capitalize">{t.type.replace('_', ' ')}</span>
                                        {' — '}
                                        {t.usedRate !== null ? `${t.usedRate}% used` : 'No ratings yet'}
                                        {' · '}{t.shown} shown
                                      </div>
                                    ))}
                                    {cvb && (cvb.custom.shown > 0 || cvb.builtIn.shown > 0) && (
                                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-0.5 text-[11px] text-neutral-500">
                                        {cvb.custom.shown > 0 && (
                                          <span>Custom triggers: <span className="text-neutral-300">{cvb.custom.usedRate !== null ? `${cvb.custom.usedRate}% used` : 'No ratings yet'}</span></span>
                                        )}
                                        {cvb.builtIn.shown > 0 && (
                                          <span>Built-in triggers: <span className="text-neutral-300">{cvb.builtIn.usedRate !== null ? `${cvb.builtIn.usedRate}% used` : 'No ratings yet'}</span></span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )
                              })()
                            )}

                            {/* Day 125 — noisy custom trigger health flags */}
                            {whisperer.summary.customTriggerHealth && (
                              <div className="rounded-lg border border-neutral-800 bg-neutral-900/20 px-3 py-2 space-y-1">
                                <div className="text-[10px] uppercase tracking-wide text-neutral-500">Needs editing</div>
                                {whisperer.summary.customTriggerHealth.needsEditing.length === 0 ? (
                                  <div className="text-[11px] text-neutral-600">No custom trigger issues detected.</div>
                                ) : (
                                  whisperer.summary.customTriggerHealth.needsEditing.slice(0, 3).map((f) => (
                                    <div key={f.type} className="text-[11px] space-y-0.5">
                                      <div className="text-neutral-400">
                                        <span className="text-amber-300 capitalize">{f.type.replace('_', ' ')}</span>
                                        {' · '}{f.usedRate !== null ? `${f.usedRate}% used` : 'No ratings yet'}
                                        {' · '}{f.shown} shown
                                      </div>
                                      <div className="text-neutral-600">Reason: {f.reason}</div>
                                      <button
                                        type="button"
                                        onClick={() => document.getElementById('custom-triggers')?.scrollIntoView({ behavior: 'smooth' })}
                                        className="text-[11px] text-emerald-300 hover:underline"
                                      >
                                        Review this custom trigger
                                      </button>
                                    </div>
                                  ))
                                )}
                              </div>
                            )}

                            <div className="space-y-2">
                              {whisperer.items.map((s) => (
                                <div key={s.sessionId} className="rounded-lg border border-neutral-800 bg-neutral-900/30 px-3 py-2 space-y-1">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-medium text-white truncate">{s.repName}</span>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span className="text-[10px] text-neutral-500">{s.triggerCount} trigger{s.triggerCount === 1 ? '' : 's'}</span>
                                      {s.status === 'stale' ? (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 uppercase tracking-wide font-semibold">Stale</span>
                                      ) : (
                                        <StatusBadge status={s.status} />
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-neutral-500">
                                    {s.topTriggerTypes[0] && <span className="capitalize">{s.topTriggerTypes[0].type.replace('_', ' ')}</span>}
                                    {s.source !== 'unknown' && <span className="capitalize">{s.source}</span>}
                                    {s.avgLatencyMs !== null && <span>{s.avgLatencyMs}ms</span>}
                                    {s.startedAt && <span>{new Date(s.startedAt).toLocaleDateString('en-GB')}</span>}
                                  </div>
                                  {s.latestSuggestion && (
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs text-neutral-300 truncate">{s.latestSuggestion.title}</span>
                                      <UrgencyBadge urgency={s.latestSuggestion.urgency as any} />
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </SectionCard>

                      {/* Tier 2B Day 130 — Suggested Trigger Candidates (read-only) */}
                      <SectionCard variant="ai" title="Suggested Trigger Candidates" subtitle="Recurring sales moments mined from recent sessions.">
                        <p className="mb-1 text-[11px] text-neutral-500">
                          Gravix can spot repeated sales moments and suggest triggers. Managers approve before anything goes live.
                        </p>
                        <p className="mb-2 text-[10px] text-neutral-600">
                          Dismissed candidates stay hidden for this manager scope.
                        </p>
                        {candidateNotice && <div className="mb-2 text-[11px] text-neutral-400">{candidateNotice}</div>}
                        {(() => {
                          const visibleCandidates = triggerCandidates.filter((c) => !dismissedCandidateIds.includes(c.id))
                          return candidatesLoading ? (
                          <div className="text-xs text-neutral-500 py-2">Loading candidates…</div>
                        ) : candidatesError ? (
                          <div className="text-xs text-red-400 py-2">Could not load trigger candidates.</div>
                        ) : triggerCandidates.length === 0 ? (
                          <div className="text-xs text-neutral-500 py-2">No trigger candidates yet.</div>
                        ) : visibleCandidates.length === 0 ? (
                          <div className="text-xs text-neutral-500 py-2">No visible trigger candidates. Refresh to review hidden suggestions again.</div>
                        ) : (
                          <div className="space-y-2">
                            {visibleCandidates.map((c) => {
                              const open = expandedCandidateId === c.id
                              return (
                                <div key={c.id} className="rounded-lg border border-neutral-800 bg-neutral-900/30 px-3 py-2.5 space-y-1.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-medium text-white">{c.title}</span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border uppercase tracking-wide font-semibold shrink-0 border-sky-500/30 bg-sky-500/10 text-sky-300">Candidate</span>
                                  </div>
                                  <div className="text-[11px] text-neutral-500">
                                    <span className="text-neutral-300">{c.type}</span>
                                    {' · '}seen {c.seenCount}×
                                    {' · '}confidence {c.confidence}
                                    {' · '}{c.examples.length} example{c.examples.length === 1 ? '' : 's'}
                                  </div>
                                  {(c.suggestedPhrases[0] || c.suggestedKeywords[0]) && (
                                    <div className="text-[11px] text-neutral-400">
                                      Suggested: <span className="text-neutral-300">{c.suggestedPhrases[0] || c.suggestedKeywords[0]}</span>
                                    </div>
                                  )}
                                  <p className="text-[11px] text-neutral-500">{c.reason}</p>
                                  <div className="flex items-center gap-2 pt-0.5">
                                    <button
                                      type="button"
                                      onClick={() => useCandidate(c)}
                                      className="rounded-md bg-emerald-600 px-2.5 py-0.5 text-[11px] font-semibold text-white hover:bg-emerald-500 transition-colors"
                                    >
                                      Use this candidate
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setExpandedCandidateId(open ? null : c.id)}
                                      className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-300 hover:bg-neutral-800 transition-colors"
                                    >
                                      {open ? 'Hide details' : 'Review candidate'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => decideCandidate(c, 'dismissed')}
                                      className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-400 hover:bg-neutral-800 transition-colors"
                                    >
                                      Hide for now
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => decideCandidate(c, 'rejected')}
                                      className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-400 hover:bg-neutral-800 transition-colors"
                                    >
                                      Reject
                                    </button>
                                    <span className="text-[10px] text-neutral-600">Manager approval required</span>
                                  </div>
                                  {open && (
                                    <div className="mt-1 space-y-1.5 border-t border-neutral-800 pt-2">
                                      <div className="text-[11px] text-neutral-400">Suggested name: <span className="text-neutral-200">{c.suggestedName}</span></div>
                                      <div className="text-[11px] text-neutral-400">{c.suggestedDescription}</div>
                                      <p className="text-[11px] text-neutral-200 leading-relaxed">{c.suggestedResponse}</p>
                                      {c.examples.length > 0 && (
                                        <ul className="space-y-1">
                                          {c.examples.map((ex, i) => (
                                            <li key={i} className="text-[11px] text-neutral-500 italic">“{ex.text}”</li>
                                          ))}
                                        </ul>
                                      )}
                                      <p className="text-[10px] text-neutral-600">
                                        Manager approval required. This candidate will not go live until saved as a custom trigger.
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )
                        })()}
                      </SectionCard>

                      {/* Tier 2B Day 119 — Custom Triggers */}
                      <div id="custom-triggers" className="scroll-mt-4">
                      <SectionCard variant="ai" title="Custom Triggers" subtitle="Team-defined Whisperer objections & responses.">
                        {triggerNotice && (
                          <div className="mb-2 text-xs text-neutral-400">{triggerNotice}</div>
                        )}
                        {!customTriggersPersistence && (
                          <div className="mb-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-300">
                            Custom triggers are not enabled yet (migration required).
                          </div>
                        )}
                        {customTriggers.length === 0 ? (
                          <EmptyRow message="No custom Whisperer triggers yet." />
                        ) : (
                          <div className="space-y-2">
                            {customTriggers.slice(0, 5).map((t) => (
                              <div key={t.id} className="rounded-lg border border-neutral-800 bg-neutral-900/30 px-3 py-2 space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-sm font-medium text-white truncate">{t.name}</span>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[10px] uppercase tracking-wide text-neutral-500">{t.type}</span>
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border uppercase tracking-wide font-semibold ${t.enabled ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-neutral-700 bg-neutral-900 text-neutral-500'}`}>
                                      {t.enabled ? 'Enabled' : 'Disabled'}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-[11px] text-neutral-500 truncate">{t.suggestionTitle}</div>
                                <div className="flex items-center gap-2 pt-0.5">
                                  <button
                                    type="button"
                                    onClick={() => toggleTrigger(t.id, !t.enabled)}
                                    disabled={triggerActioningId === t.id}
                                    className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-0.5 text-[11px] text-neutral-300 hover:bg-neutral-800 transition-colors disabled:opacity-50"
                                  >
                                    {t.enabled ? 'Disable' : 'Enable'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteTrigger(t.id, t.name)}
                                    disabled={triggerActioningId === t.id}
                                    className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-300 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {showTriggerForm ? (
                          <div className="mt-3 space-y-2 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                            <input value={triggerDraft.name} onChange={(e) => setTriggerDraft({ ...triggerDraft, name: e.target.value })} placeholder="Name (e.g. Competitor: Acme)" className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-200" />
                            <div className="flex gap-2">
                              <select value={triggerDraft.type} onChange={(e) => setTriggerDraft({ ...triggerDraft, type: e.target.value })} className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-200">
                                {['competitor', 'price', 'timing', 'authority', 'trust', 'send_info', 'custom'].map((x) => <option key={x} value={x}>{x}</option>)}
                              </select>
                              <select value={triggerDraft.urgency} onChange={(e) => setTriggerDraft({ ...triggerDraft, urgency: e.target.value })} className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-200">
                                {['low', 'medium', 'high'].map((x) => <option key={x} value={x}>{x}</option>)}
                              </select>
                            </div>
                            <input value={triggerDraft.matchPhrases} onChange={(e) => setTriggerDraft({ ...triggerDraft, matchPhrases: e.target.value })} placeholder="Match phrases (comma-separated)" className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-200" />
                            <input value={triggerDraft.matchKeywords} onChange={(e) => setTriggerDraft({ ...triggerDraft, matchKeywords: e.target.value })} placeholder="Keywords (comma-separated)" className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-200" />
                            <input value={triggerDraft.suggestionTitle} onChange={(e) => setTriggerDraft({ ...triggerDraft, suggestionTitle: e.target.value })} placeholder="Suggestion title" className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-200" />
                            <textarea value={triggerDraft.suggestionResponse} onChange={(e) => setTriggerDraft({ ...triggerDraft, suggestionResponse: e.target.value })} placeholder="Suggested response" rows={2} className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs text-neutral-200" />
                            <div className="flex items-center gap-2">
                              <button type="button" onClick={submitTrigger} disabled={savingTrigger} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">{savingTrigger ? 'Saving…' : 'Save trigger'}</button>
                              <button type="button" onClick={() => setShowTriggerForm(false)} className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-900">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button type="button" onClick={() => { setShowTriggerForm(true); setTriggerNotice(null) }} className="mt-3 rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-900 transition-colors">
                            Add trigger
                          </button>
                        )}
                      </SectionCard>
                      </div>
                    </div>
                  </div>
                </>
              )}

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
                              <Link href={`/crm/reps/${rep.rep_id}`} className="text-sm font-medium text-white hover:underline">
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
                            <Link href={`/crm/reps/${rep.rep_id}`} className="rounded-md bg-indigo-600/20 px-2 py-1 text-xs font-semibold text-indigo-200 hover:bg-indigo-600/30 transition-colors">
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
                          href={`/crm/reps/${rep.rep_id}`}
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
                                  <Link href={`/crm/reps/${rep.rep_id}`} className="font-medium text-white hover:underline">{rep.rep_name}</Link>
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
                                <Link href={`/crm/reps/${rep.rep_id}`} className="font-medium text-white hover:underline">{rep.rep_name}</Link>
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
              {ASSIGNMENT_EMPTY_COPY[assignmentFilter]}
            </div>
          )}
          {!assignmentsLoading && filteredAssignments.length > 0 && (
            <div className="rounded-xl border border-neutral-800 overflow-hidden">
              <div className="divide-y divide-neutral-800/60">
                {filteredAssignments.map((a) => {
                  const isCompleted = a.status === 'completed'
                  const isOverdue = !isCompleted && a.due_at && new Date(a.due_at) < new Date()
                  const priority = assignmentPriorityOf(a)
                  const originLabel = assignmentOriginLabel(a)
                  const sourceCallId = assignmentSourceCallIdOf(a)
                  const due = dueLabelOf(a)
                  const notes = String(a.meta?.coaching_notes || '').trim()
                  const repName = (a.rep_id && repNameById.get(String(a.rep_id))) || null
                  return (
                    <div key={a.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-white truncate">{a.title || 'Untitled assignment'}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border uppercase tracking-wide font-semibold shrink-0 ${
                            isCompleted
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                              : isOverdue
                                ? 'border-red-500/30 bg-red-500/10 text-red-300'
                                : 'border-neutral-700 bg-neutral-900 text-neutral-300'
                          }`}>
                            {isCompleted ? 'Completed' : isOverdue ? 'Overdue' : 'Open'}
                          </span>
                          {!isCompleted && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border uppercase tracking-wide font-semibold shrink-0 ${PRIORITY_BADGE_CLS[priority]}`}>
                              {priority}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-x-2 gap-y-0.5 text-xs text-neutral-500 flex-wrap">
                          {repName && <span className="text-neutral-300">{repName}</span>}
                          <span>{String(a.type || 'assignment').replace('_', ' ')}</span>
                          {originLabel && <span>{originLabel}</span>}
                          {due && <span className={due.cls}>{due.text}</span>}
                        </div>
                        {notes && (
                          <div className="mt-1 text-xs text-neutral-500 truncate max-w-xl" title={notes}>
                            {notes}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {sourceCallId && (
                          <Link href={`/calls/${sourceCallId}`} className="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800 transition-colors">
                            From call →
                          </Link>
                        )}
                        {a.rep_id && (
                          <Link href={`/crm/reps/${a.rep_id}`} className="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800 transition-colors">
                            Rep →
                          </Link>
                        )}
                      </div>
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
                          {call.rep_name || 'Unknown rep'} · {new Date(call.created_at).toLocaleDateString('en-GB')}
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

      {/* ── REVIEW QUEUE (Sprint 4 Day 91) ── */}
      {tab === 'review' && (
        <div className="space-y-3">
          {reviewNotice && (
            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                reviewNotice.type === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300'
                  : 'border-red-500/30 bg-red-500/5 text-red-300'
              }`}
            >
              {reviewNotice.text}
            </div>
          )}

          {reviewQueueLoading && <LoadingText text="Loading review queue…" />}
          {reviewQueueError && !reviewQueueLoading && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-4 text-sm text-red-300">{reviewQueueError}</div>
          )}

          {!reviewQueueLoading && !reviewQueueError && reviewQueue.length === 0 && (
            <div className="rounded-xl border border-neutral-800 px-4 py-5 text-sm text-neutral-400">
              No calls need manager review.
            </div>
          )}

          {!reviewQueueLoading && !reviewQueueError && reviewQueue.length > 0 && (
            <div className="rounded-xl border border-neutral-800 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
                <div className="text-sm font-medium text-white">Calls Awaiting Manager Review</div>
                <span className="text-xs text-neutral-500">Lowest score first · last 30 days</span>
              </div>
              <div className="divide-y divide-neutral-800/60">
                {reviewQueue.map((item) => (
                  <div key={item.callId} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white truncate">{item.title}</span>
                        <ScorePill score={item.overallScore} className="shrink-0" />
                      </div>
                      <div className="mt-0.5 text-xs text-neutral-500">
                        {item.repName}
                        {item.weakestSkill !== 'Unknown' ? ` · Weakest: ${item.weakestSkill}` : ''}
                        {item.createdAt ? ` · ${new Date(item.createdAt).toLocaleDateString('en-GB')}` : ''}
                      </div>
                      {item.reasons.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {item.reasons.map((reason) => (
                            <span
                              key={reason}
                              className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300"
                            >
                              {reason}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Link
                        href={`/calls/${item.callId}`}
                        className="rounded-md bg-indigo-600/20 px-2.5 py-1.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-600/30 transition-colors"
                      >
                        Review Call
                      </Link>
                      <button
                        type="button"
                        onClick={() => markReviewed(item.callId)}
                        disabled={markingReviewedId === item.callId}
                        className="rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 transition-colors disabled:opacity-50"
                      >
                        {markingReviewedId === item.callId ? 'Marking…' : 'Mark Reviewed'}
                      </button>
                      <button
                        type="button"
                        onClick={() => openAssignCoaching(item)}
                        className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-colors"
                      >
                        Assign Coaching
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button type="button" onClick={loadReviewQueue} className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-900 transition-colors">
              Refresh
            </button>
          </div>
        </div>
      )}

      {/* ── ASSIGN COACHING MODAL (Sprint 4 Day 92) ── */}
      {assignDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-950 p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-base font-semibold text-neutral-100">Assign Coaching</div>
                <div className="mt-1 text-xs text-neutral-500">
                  {assignDraft.repName} · score {assignDraft.overallScore}
                  {assignDraft.weakestSkill !== 'Unknown' ? ` · weakest: ${assignDraft.weakestSkill}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAssignDraft(null)}
                className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:bg-neutral-900"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs text-neutral-500">Title</label>
                <input
                  value={assignDraft.title}
                  onChange={(e) => setAssignDraft({ ...assignDraft, title: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200"
                />
              </div>

              <div>
                <label className="text-xs text-neutral-500">Note for the rep</label>
                <textarea
                  value={assignDraft.note}
                  onChange={(e) => setAssignDraft({ ...assignDraft, note: e.target.value })}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-neutral-500">Due date</label>
                  <input
                    type="date"
                    value={assignDraft.dueYmd}
                    onChange={(e) => setAssignDraft({ ...assignDraft, dueYmd: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200"
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-500">Priority</label>
                  <select
                    value={assignDraft.priority}
                    onChange={(e) => setAssignDraft({ ...assignDraft, priority: e.target.value as AssignDraft['priority'] })}
                    className="mt-1 w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200"
                  >
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={assigning}
                onClick={() => setAssignDraft(null)}
                className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm font-semibold text-neutral-200 hover:bg-neutral-900 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={assigning}
                onClick={() => void submitAssignCoaching()}
                className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
              >
                {assigning ? 'Assigning…' : 'Assign Coaching'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
