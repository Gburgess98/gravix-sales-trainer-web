// Pure model for the manager Insights command centre (/crm/analytics). No React, no I/O.
//
// Rules this file exists to enforce:
//   • Missing data is NEVER a zero. Every figure is `number | null`; null renders as "unavailable".
//   • An empty window is never "healthy": nothing here produces a positive label without a real scored sample.
//   • Only fields the API really returns are read. Nothing is invented (no target, revenue, pipeline, XP, duration, flags).
// Sources: GET /v1/crm/analytics/score-trend, /v1/manager/command-centre, /v1/admin/config, /v1/crm/analytics/activity-by-rep.

export const PERIODS = [30, 90, 365] as const
export type Period = (typeof PERIODS)[number]
export const DEFAULT_PERIOD: Period = 365

/** `?days=` → a supported period; anything else (missing, 7, "abc", 3650) falls back to the default. */
export function parsePeriod(v: string | number | null | undefined): Period {
  const n = Number(v)
  return (PERIODS as readonly number[]).includes(n) ? (n as Period) : DEFAULT_PERIOD
}

export const periodLabel = (days: number) => `last ${days} days`

/* ───────────────────────── request outcomes ───────────────────────── */

export type Outcome = 'ok' | 'permission' | 'unauthenticated' | 'error'

/** HTTP status → how the UI must treat it. `null` = the request never completed (network). */
export function outcomeOf(status: number | null | undefined, bodyOk?: boolean | null): Outcome {
  if (status == null) return 'error'
  if (status === 401) return 'unauthenticated'
  if (status === 403) return 'permission'
  if (status >= 200 && status < 300) return bodyOk === false ? 'error' : 'ok'
  return 'error'
}

export type Section<T> = { status: 'loading' | Outcome; data: T | null }
export const loadingSection = <T,>(): Section<T> => ({ status: 'loading', data: null })

/* ───────────────────────────── numbers ───────────────────────────── */

/** A finite number, or null. Never coerces null/undefined/""/NaN/booleans into 0. */
export function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

const count = (v: unknown): number | null => {
  const n = num(v)
  return n !== null && n >= 0 && Number.isInteger(n) ? n : null
}

/* ─────────────────────────── score trend ─────────────────────────── */

export type TrendPoint = { date: string; avg: number; count: number | null }

/** `{ trend: [{ date, avg_score, count? }] }`. Points without a real average are dropped (not zeroed); `count` stays null when absent. */
export function parseTrend(json: unknown): TrendPoint[] {
  const rows = (json as { trend?: unknown } | null)?.trend
  if (!Array.isArray(rows)) return []
  const out: TrendPoint[] = []
  for (const r of rows) {
    const o = r as { date?: unknown; avg_score?: unknown; count?: unknown } | null
    const avg = num(o?.avg_score)
    const date = typeof o?.date === 'string' ? o.date : ''
    if (avg === null || !/^\d{4}-\d{2}-\d{2}/.test(date)) continue
    out.push({ date: date.slice(0, 10), avg, count: count(o?.count) })
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

export type TrendSummary = {
  days: number
  /** Total scored calls behind the points — null unless EVERY point reports its sample size. */
  scoredCalls: number | null
  lastDate: string | null
  /** Call-weighted mean of the points — null unless every point reports its sample size. */
  weightedAverage: number | null
}

export function summariseTrend(points: TrendPoint[]): TrendSummary {
  const known = points.length > 0 && points.every((p) => p.count !== null)
  const scoredCalls = known ? points.reduce((n, p) => n + (p.count as number), 0) : null
  const weightedAverage = known && scoredCalls ? Math.round(points.reduce((s, p) => s + p.avg * (p.count as number), 0) / scoredCalls) : null
  return { days: points.length, scoredCalls, lastDate: points.length ? points[points.length - 1].date : null, weightedAverage }
}

export type TrendShape = 'empty' | 'single' | 'series'
export const trendShape = (points: TrendPoint[]): TrendShape => (points.length === 0 ? 'empty' : points.length === 1 ? 'single' : 'series')

/* ──────────────────────────── command centre ──────────────────────────── */

export type AttentionRep = { repId: string; repName: string | null; averageScore: number | null; level: 'red' | 'amber'; reason: string; action: string | null }
export type SkillRow = { skill: string; weakCalls: number | null; averageScore: number | null; previousAverageScore: number | null; trend: 'up' | 'down' | 'flat' | 'new' | null; trendLabel: string | null }

export type Centre = {
  /** null = unavailable. Never 0 for "no scored calls". */
  averageScore: number | null
  scoredCalls: number | null
  callsNeedingReview: number | null
  /** All unfinished assignments right now — overdue ones are part of this number. */
  openAssignments: number | null
  overdueAssignments: number | null
  /** Assignments completed inside the window. */
  completedAssignments: number | null
  repsNeedingAttention: AttentionRep[]
  weakestSkills: SkillRow[]
}

export function parseCentre(json: unknown): Centre | null {
  const j = json as Record<string, any> | null
  if (!j || j.ok === false || !j.teamHealth || typeof j.teamHealth !== 'object') return null
  const h = j.teamHealth
  const scoredCalls = count(h.scoredCalls)
  let averageScore = num(h.averageScore)
  // The API before the null-average fix reported 0 for "no scored calls". Without `scoredCalls` we cannot tell that from a
  // genuine 0, so an unconfirmed 0 is unavailable — and any average with zero scored calls is unavailable by definition.
  if (scoredCalls === 0) averageScore = null
  else if (averageScore === 0 && scoredCalls === null) averageScore = null
  const reps: AttentionRep[] = (Array.isArray(j.repsNeedingAttention) ? j.repsNeedingAttention : [])
    .filter((r: any) => r && typeof r.repId === 'string' && (r.riskLevel === 'red' || r.riskLevel === 'amber'))
    .map((r: any) => ({
      repId: r.repId,
      repName: typeof r.repName === 'string' && r.repName.trim() ? r.repName : null,
      averageScore: scoredCalls === 0 ? null : num(r.averageScore),
      level: r.riskLevel,
      reason: typeof r.riskReason === 'string' ? r.riskReason : 'Flagged for attention',
      action: typeof r.recommendedAction === 'string' && r.recommendedAction.trim() ? r.recommendedAction : null,
    }))
  const skills: SkillRow[] = (Array.isArray(j.weakestSkills) ? j.weakestSkills : [])
    .filter((s: any) => s && typeof s.skill === 'string')
    .map((s: any) => ({
      skill: s.skill,
      weakCalls: count(s.count),
      averageScore: num(s.averageScore),
      previousAverageScore: num(s.previousAverageScore),
      trend: s.trend === 'up' || s.trend === 'down' || s.trend === 'flat' || s.trend === 'new' ? s.trend : null,
      trendLabel: typeof s.trendLabel === 'string' ? s.trendLabel : null,
    }))
  return {
    averageScore,
    scoredCalls,
    callsNeedingReview: count(h.callsNeedingReview),
    openAssignments: count(h.openAssignments),
    overdueAssignments: count(h.overdueAssignments),
    completedAssignments: count(j.coachingImpact?.completedAssignments),
    repsNeedingAttention: reps,
    weakestSkills: skills,
  }
}

/* ───────────────────────────── thresholds ───────────────────────────── */

export type Thresholds = { low: number; critical: number }

/** From GET /v1/admin/config. Anything missing or inconsistent is "unavailable" — no default target is ever substituted. */
export function parseThresholds(json: unknown): Thresholds | null {
  const j = json as Record<string, any> | null
  if (!j || j.ok === false) return null
  const low = num(j.scoring?.low ?? j.config?.low_score_threshold)
  const critical = num(j.scoring?.critical ?? j.config?.critical_score_threshold)
  if (low === null || critical === null) return null
  if (low < 0 || low > 100 || critical < 0 || critical > 100 || critical > low) return null
  return { low, critical }
}

export type Band = 'critical' | 'low' | 'above'
/** Where an average sits against the real thresholds. null average → null band (nothing to place). */
export function bandOf(avg: number | null, t: Thresholds | null): Band | null {
  if (avg === null || !t) return null
  if (avg < t.critical) return 'critical'
  if (avg < t.low) return 'low'
  return 'above'
}

export const BAND_LABEL: Record<Band, string> = {
  critical: 'Below the critical threshold',
  low: 'Below the low threshold',
  above: 'At or above the low threshold',
}

/* ─────────────────────────── rep + KPI helpers ─────────────────────────── */

export type Kpis = {
  averageScore: number | null
  scoredCalls: number | null
  /** Why the average is unavailable, in words — null when it is available. */
  averageNote: string
}

/**
 * KPI inputs for the selected scope. All reps: the command centre's figures (sample size falls back to the trend's counts).
 * One rep: the command centre is team-wide, so the rep's own call-weighted average and sample come from their trend.
 */
export function kpisFor(scope: 'team' | 'rep', centre: Centre | null, trend: TrendPoint[]): Kpis {
  const t = summariseTrend(trend)
  if (scope === 'rep') {
    const avg = t.weightedAverage
    return { averageScore: avg, scoredCalls: t.scoredCalls ?? (trend.length === 0 ? 0 : null), averageNote: avg === null ? (trend.length === 0 ? 'No scored calls in this period' : 'Unavailable') : '' }
  }
  const scoredCalls = centre?.scoredCalls ?? t.scoredCalls ?? (trend.length === 0 && centre ? 0 : null)
  const averageScore = centre ? centre.averageScore : null
  const note = averageScore !== null ? '' : scoredCalls === 0 ? 'No scored calls in this period' : 'Unavailable'
  return { averageScore, scoredCalls, averageNote: note }
}

/** Label for a point count: "1 call" / "12 calls" / "calls not reported". */
export const callsLabel = (n: number | null) => (n === null ? 'sample size not reported' : `${n} ${n === 1 ? 'call' : 'calls'}`)

export function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso)
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : null
}
