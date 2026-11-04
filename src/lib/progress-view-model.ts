// Pure helpers for the rep Progress screen (glass system). No React, no I/O.
// Inputs are the rep's OWN data: GET /v1/reps/:id/weakness-trends (per-stage score series from the latest
// 100 calls, oldest first), plus assignments. Nothing here invents a score, a comparison or a completion.

import { evidenceOf, typeLabel, type MyAssignment } from './my-assignments-model.ts'

export type Point = { date: string; value: number }
export type WeaknessTrends = {
  intro?: Point[]
  discovery?: Point[]
  objection_handling?: Point[]
  closing?: Point[]
  overall?: Point[]
}

/** The four stages the scorer actually produces. (The old "Confidence" row was never a scored stage.) */
export const SKILLS = [
  { key: 'intro', label: 'Intro' },
  { key: 'discovery', label: 'Discovery' },
  { key: 'objection_handling', label: 'Objection handling' },
  { key: 'closing', label: 'Closing' },
] as const
export type SkillKey = (typeof SKILLS)[number]['key']

/** The API returns the latest 100 calls; a longer history is truncated and must be labelled as such. */
export const HISTORY_LIMIT = 100
export const STEADY_BAND = 3

export type Range = 30 | 90
const DAY = 86_400_000
const t = (iso: string) => {
  const v = new Date(iso).getTime()
  return Number.isFinite(v) ? v : null
}

const avg = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null)
const r1 = (n: number | null) => (n === null ? null : Math.round(n))

/** Split a series into [now-days, now] and [now-2*days, now-days). Points with unparseable dates are dropped. */
export function splitPeriods(points: Point[] | undefined, days: number, now: Date = new Date()) {
  const cur: number[] = []
  const prev: number[] = []
  for (const p of points ?? []) {
    const ms = t(p.date)
    if (ms === null || typeof p.value !== 'number' || !Number.isFinite(p.value)) continue
    const age = now.getTime() - ms
    if (age < 0 || age > days * 2 * DAY) continue
    if (age <= days * DAY) cur.push(p.value)
    else prev.push(p.value)
  }
  return { cur, prev }
}

/** `overall` is `score_overall || 0` on the API, so a call that was never scored shows as 0. A 0 is not a score. */
export const scoredOverall = (points: Point[] | undefined) => (points ?? []).filter((p) => typeof p.value === 'number' && p.value > 0)

export type Direction = 'up' | 'down' | 'steady'
export type PeriodSummary = {
  days: number
  current: { avg: number | null; count: number }
  previous: { avg: number | null; count: number }
  /** current − previous, whole points; null unless BOTH periods have at least one scored call. */
  delta: number | null
  direction: Direction | null
}

export function summarisePeriods(points: Point[] | undefined, days: number, now: Date = new Date()): PeriodSummary {
  const { cur, prev } = splitPeriods(scoredOverall(points), days, now)
  const ca = r1(avg(cur))
  const pa = r1(avg(prev))
  const delta = ca !== null && pa !== null ? ca - pa : null
  const direction: Direction | null = delta === null ? null : delta > STEADY_BAND ? 'up' : delta < -STEADY_BAND ? 'down' : 'steady'
  return { days, current: { avg: ca, count: cur.length }, previous: { avg: pa, count: prev.length }, delta, direction }
}

export type SkillRow = { key: SkillKey; label: string; avg: number | null; count: number; prevAvg: number | null; delta: number | null }

export function skillRows(trends: WeaknessTrends | null | undefined, days: number, now: Date = new Date()): SkillRow[] {
  return SKILLS.map(({ key, label }) => {
    const { cur, prev } = splitPeriods(trends?.[key], days, now)
    const a = r1(avg(cur))
    const p = r1(avg(prev))
    return { key, label, avg: a, count: cur.length, prevAvg: p, delta: a !== null && p !== null ? a - p : null }
  })
}

/** Strongest/weakest only when at least two skills have data and they differ; otherwise nothing is claimed. */
export function strongestWeakest(rows: SkillRow[]): { strongest: SkillRow | null; weakest: SkillRow | null } {
  const have = rows.filter((r) => r.avg !== null) as Array<SkillRow & { avg: number }>
  if (have.length < 2) return { strongest: null, weakest: null }
  const sorted = [...have].sort((a, b) => a.avg - b.avg)
  const weakest = sorted[0]
  const strongest = sorted[sorted.length - 1]
  if (weakest.avg === strongest.avg) return { strongest: null, weakest: null }
  return { strongest, weakest }
}

export type ChartPoint = { day: string; score: number }
/** One point per scored call in the current period, oldest first. */
export function chartPoints(overall: Point[] | undefined, days: number, now: Date = new Date()): ChartPoint[] {
  return scoredOverall(overall)
    .filter((p) => {
      const ms = t(p.date)
      return ms !== null && now.getTime() - ms <= days * DAY && now.getTime() - ms >= 0
    })
    .map((p) => ({ day: new Date(p.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), score: Math.round(p.value) }))
}

export const isTruncated = (overall: Point[] | undefined) => (overall?.length ?? 0) >= HISTORY_LIMIT

/** One honest sentence; no claim without both periods. */
export function headline(s: PeriodSummary, hasAnyScoredCall = false): string {
  if (s.current.avg === null && s.previous.avg === null && !hasAnyScoredCall) return 'No scored calls yet'
  if (s.current.avg === null) return `No scored calls in the last ${s.days} days`
  if (s.delta === null) return `Average call score ${s.current.avg}`
  if (s.direction === 'up') return `Your call score is up ${s.delta} ${s.delta === 1 ? 'point' : 'points'}`
  if (s.direction === 'down') return `Your call score is down ${-s.delta} ${s.delta === -1 ? 'point' : 'points'}`
  return 'Your call score is steady'
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
/** Date range + sample sizes, spelled out so the comparison can be checked. */
export function comparisonLabel(s: PeriodSummary): string {
  const cur = s.current.avg === null ? null : `Last ${s.days} days: average ${s.current.avg} from ${plural(s.current.count, 'call')}`
  const prev = s.previous.avg === null ? null : `previous ${s.days} days: ${s.previous.avg} from ${plural(s.previous.count, 'call')}`
  if (cur && prev) return `${cur} · ${prev}`
  if (cur) return `${cur} · no scored calls in the previous ${s.days} days to compare`
  return ''
}

export type DoneRow = { id: string; title: string; type: string; completedAt: string | null; evidence: string | null }
export function recentCompleted(items: MyAssignment[], limit = 5): DoneRow[] {
  return items
    .filter((a) => ['completed', 'reviewed'].includes(String(a.status ?? '').toLowerCase()) && a.completed_at)
    .sort((a, b) => (t(b.completed_at as string) ?? 0) - (t(a.completed_at as string) ?? 0))
    .slice(0, limit)
    .map((a) => ({ id: a.id, title: a.title || 'Untitled assignment', type: typeLabel(a.type), completedAt: a.completed_at ?? null, evidence: evidenceOf(a)?.detail ?? null }))
}

export function completedCounts(items: MyAssignment[], now: Date = new Date()) {
  const done = items.filter((a) => ['completed', 'reviewed'].includes(String(a.status ?? '').toLowerCase()) && a.completed_at)
  const within = (d: number) => done.filter((a) => { const ms = t(a.completed_at as string); return ms !== null && now.getTime() - ms <= d * DAY && ms <= now.getTime() + DAY }).length
  return { d7: within(7), d30: within(30), total: done.length }
}

export const openCount = (items: MyAssignment[]) => items.filter((a) => ['assigned', 'open', ''].includes(String(a.status ?? '').toLowerCase())).length

/** API stage slugs (`objection_handling`) are identifiers, not labels. Unknown text is humanised, never shown raw. */
export function skillLabel(category: string | null | undefined): string | null {
  const c = String(category ?? '').trim()
  if (!c) return null
  const known = SKILLS.find((k) => k.key === c.toLowerCase().replace(/\s+/g, '_'))
  if (known) return known.label
  const t = c.replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}
