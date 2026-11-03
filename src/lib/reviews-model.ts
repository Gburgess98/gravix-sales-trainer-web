// Pure helpers for the manager Reviews queue (glass system). No React, no I/O.
// Shapes mirror GET /v1/manager/review-queue items. The API has no due dates, SLAs or customer names,
// so "age" is derived from the call date and nothing here invents a deadline.

import { ragFromScore, type Rag } from './manager-model.ts'

export type ReviewItemLike = {
  callId: string
  repId?: string | null
  repName?: string | null
  title?: string | null
  overallScore?: number | null
  weakestSkill?: string | null
  createdAt?: string | null
  reasons?: string[] | null
}

export type ScoreBand = 'all' | 'low' | 'mid' | 'high'
export type AgeFilter = 'any' | 'recent' | 'waiting3' | 'waiting7'
export type ReviewSort = 'score' | 'oldest'
export type ReviewFilters = { q?: string; rep?: string; band?: ScoreBand; age?: AgeFilter }

/** Derived, not an SLA: a call this old and still unreviewed is flagged as "waiting a while". */
export const LONG_WAIT_DAYS = 3

const DAY = 86_400_000
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** Whole calendar days since the call; null when the date is missing or unparseable. */
export function ageDays(createdAt: string | null | undefined, now: Date = new Date()): number | null {
  if (!createdAt) return null
  const d = new Date(createdAt)
  if (!Number.isFinite(d.getTime())) return null
  return Math.max(0, Math.round((startOfDay(now) - startOfDay(d)) / DAY))
}

export function ageLabel(createdAt: string | null | undefined, now: Date = new Date()): string {
  const n = ageDays(createdAt, now)
  if (n === null) return 'Date unknown'
  if (n === 0) return 'Today'
  if (n === 1) return 'Yesterday'
  if (n < 14) return `${n} days ago`
  return `${Math.floor(n / 7)} weeks ago`
}

/** Same thresholds as the shared status language: red < 55, amber < 70, otherwise green. */
export function bandOf(score: number | null | undefined): Exclude<ScoreBand, 'all'> | null {
  const rag: Rag | null = ragFromScore(score)
  return rag === 'red' ? 'low' : rag === 'amber' ? 'mid' : rag === 'green' ? 'high' : null
}

export function isLongWait(item: ReviewItemLike, now: Date = new Date()): boolean {
  const n = ageDays(item.createdAt, now)
  return n !== null && n >= LONG_WAIT_DAYS
}

export function summariseReviews(items: ReviewItemLike[], now: Date = new Date()) {
  return {
    waiting: items.length,
    waitingLong: items.filter((i) => isLongWait(i, now)).length,
    lowScore: items.filter((i) => bandOf(i.overallScore) === 'low').length,
  }
}

/** The API returns "Unknown rep" when it cannot resolve a name; never show that as an identity. */
export function apiRepName(name: string | null | undefined): string | null {
  const n = String(name ?? '').trim()
  return !n || /^unknown rep$/i.test(n) ? null : n
}

export function filterReviews(
  items: ReviewItemLike[],
  f: ReviewFilters,
  repName: (item: ReviewItemLike) => string,
  now: Date = new Date(),
): ReviewItemLike[] {
  const q = (f.q ?? '').trim().toLowerCase()
  return items.filter((i) => {
    if (f.rep && f.rep !== 'all' && String(i.repId ?? '') !== f.rep) return false
    if (f.band && f.band !== 'all' && bandOf(i.overallScore) !== f.band) return false
    if (f.age && f.age !== 'any') {
      const n = ageDays(i.createdAt, now)
      if (n === null) return false
      if (f.age === 'recent' && n >= LONG_WAIT_DAYS) return false
      if (f.age === 'waiting3' && n < LONG_WAIT_DAYS) return false
      if (f.age === 'waiting7' && n < 7) return false
    }
    if (q) {
      const hay = [repName(i), i.title, i.weakestSkill, ...(i.reasons ?? [])].join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

/** score: lowest first (the API's own order), ties newest first. oldest: longest waiting first. Stable, non-mutating. */
export function sortReviews<T extends ReviewItemLike>(items: T[], sort: ReviewSort): T[] {
  const t = (i: ReviewItemLike) => {
    const v = new Date(i.createdAt ?? '').getTime()
    return Number.isFinite(v) ? v : Number.POSITIVE_INFINITY
  }
  const s = (i: ReviewItemLike) => (typeof i.overallScore === 'number' ? i.overallScore : 101)
  return [...items].sort((a, b) => (sort === 'oldest' ? t(a) - t(b) || s(a) - s(b) : s(a) - s(b) || t(b) - t(a)))
}
