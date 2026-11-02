// Pure helpers for the glass-system manager screens (Overview, Team). No React, no I/O.
// Status language is fixed across both screens: green = On track, amber = Needs attention, red = At risk.
import type { Tone } from './ds-model'

export type Rag = 'red' | 'amber' | 'green'

export const RAG_META: Record<Rag, { label: string; tone: Tone }> = {
  green: { label: 'On track', tone: 'good' },
  amber: { label: 'Needs attention', tone: 'warn' },
  red: { label: 'At risk', tone: 'bad' },
}

const RAG_ORDER: Record<Rag, number> = { green: 0, amber: 1, red: 2 }

/** Same thresholds the Overview has always used for the average score: <55 red, <70 amber. */
export function ragFromScore(avg: number | null | undefined): Rag | null {
  if (typeof avg !== 'number' || !Number.isFinite(avg)) return null
  if (avg < 55) return 'red'
  if (avg < 70) return 'amber'
  return 'green'
}

/** The worst of the given statuses; null entries are ignored, null when none is known. */
export function worstRag(...all: Array<Rag | null | undefined>): Rag | null {
  let worst: Rag | null = null
  for (const r of all) {
    if (!r) continue
    if (!worst || RAG_ORDER[r] > RAG_ORDER[worst]) worst = r
  }
  return worst
}

/** A rep's status: the worst of the API's risk level, their score band, and overdue coaching (any overdue = amber). */
export function repRag(input: { avgScore?: number | null; riskLevel?: Rag | null; overdue?: number | null }): Rag | null {
  const overdue = Number(input.overdue ?? 0) > 0 ? 'amber' : null
  return worstRag(input.riskLevel, ragFromScore(input.avgScore), overdue)
}

export type Trend = { dir: 'up' | 'down' | 'flat'; delta: number }

/** current vs baseline; ±3 points is the threshold the API uses for skill trends, so the UI agrees with it. */
export function trendBetween(current: number | null | undefined, baseline: number | null | undefined): Trend | null {
  if (typeof current !== 'number' || typeof baseline !== 'number') return null
  if (!Number.isFinite(current) || !Number.isFinite(baseline)) return null
  const delta = Math.round(current - baseline)
  return { dir: delta >= 3 ? 'up' : delta <= -3 ? 'down' : 'flat', delta }
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** One plain sentence answering "how is my team?" from counts the command-centre already returns. */
export function healthHeadline(i: { status: Rag; repsNeedingAttention: number; overdue: number; callsNeedingReview: number }): string {
  const parts: string[] = []
  if (i.repsNeedingAttention > 0) parts.push(`${plural(i.repsNeedingAttention, 'rep needs', 'reps need')} attention`)
  if (i.overdue > 0) parts.push(`${plural(i.overdue, 'assignment is', 'assignments are')} overdue`)
  if (i.callsNeedingReview > 0) parts.push(`${plural(i.callsNeedingReview, 'call is', 'calls are')} waiting for review`)
  if (parts.length === 0) return i.status === 'green' ? 'Nothing needs your attention right now.' : 'No open items, but scores are below target.'
  return parts.join(' · ')
}

export type SkillMove = { skill: string; averageScore: number; previousAverageScore?: number | null; delta?: number | null }

/** The single skill whose average moved the most versus the previous period; null when no skill has a comparison. */
export function biggestMovement<T extends SkillMove>(skills: T[]): T | null {
  let best: T | null = null
  for (const s of skills) {
    if (typeof s.delta !== 'number' || !Number.isFinite(s.delta)) continue
    if (!best || Math.abs(s.delta) > Math.abs(best.delta as number)) best = s
  }
  return best
}
