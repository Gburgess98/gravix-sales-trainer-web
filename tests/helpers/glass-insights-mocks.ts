import type { Page, Route } from '@playwright/test'
import { fakeManagerSession } from './glass-fixtures'

/** Mocked /api/proxy for the manager Insights + Assignments tests. Never real data. Supabase traffic is blocked. */

const iso = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)
export const R1 = '11111111-1111-4111-8111-111111111111'
export const R2 = '22222222-2222-4222-8222-222222222222'
export const R3 = '33333333-3333-4333-8333-333333333333'
export const ROSTER = [
  { id: R1, name: 'Alex Johnson', email: 'alex@example.test' },
  { id: R2, name: 'Sam Rivera', email: 'sam@example.test' },
  { id: R3, name: '', email: 'priya.nair@example.test' },
]

export const TREND_FULL = [[18, 60, 2], [15, 62, 3], [12, 61, 1], [9, 66, 4], [5, 70, 2], [2, 72, 3]].map(([d, a, c]) => ({ date: iso(d), avg_score: a, count: c })) // 15 scored calls
export const TREND_SINGLE = [{ date: iso(3), avg_score: 40, count: 1 }]

export const CENTRE_FULL = {
  ok: true,
  windowDays: 365,
  teamHealth: { status: 'amber', averageScore: 62, scoredCalls: 15, reviewedCalls: 4, callsNeedingReview: 3, openAssignments: 5, overdueAssignments: 2 },
  repsNeedingAttention: [
    { repId: R1, repName: 'Alex Johnson', averageScore: 52, riskLevel: 'red', riskReason: 'Average score below 55', recommendedAction: 'Run a discovery drill' },
    { repId: R2, repName: 'Sam Rivera', averageScore: 66, riskLevel: 'amber', riskReason: 'Average score below 70', recommendedAction: 'Review recent calls' },
  ],
  weakestSkills: [
    { skill: 'Discovery', count: 4, averageScore: 48, previousAverageScore: 55, delta: -7, trend: 'down', trendLabel: '↓ from 55' },
    { skill: 'Closing', count: 3, averageScore: 58, previousAverageScore: 50, delta: 8, trend: 'up', trendLabel: '↑ from 50' },
    { skill: 'Objection handling', count: 2, averageScore: 61, previousAverageScore: 60, delta: 1, trend: 'flat', trendLabel: 'No major change' },
    { skill: 'Intro', count: 1, averageScore: 64, previousAverageScore: null, delta: null, trend: 'new', trendLabel: 'New this period' },
  ],
  coachingImpact: { completedAssignments: 7, skillsImproving: 1, skillsDeclining: 1, summary: '1 skill improving, 1 declining' },
}
/** The API after the null-average fix, for a window with no scored calls. Open/overdue are real, non-zero. */
export const CENTRE_EMPTY = { ok: true, windowDays: 30, teamHealth: { status: 'green', averageScore: null, scoredCalls: 0, reviewedCalls: 0, callsNeedingReview: 0, openAssignments: 2, overdueAssignments: 1 }, repsNeedingAttention: [], weakestSkills: [], coachingImpact: { completedAssignments: 0, skillsImproving: 0, skillsDeclining: 0, summary: '0 skills improving, 0 declining' } }
/** The API BEFORE the fix: no `scoredCalls`, and an empty window reported as averageScore 0. */
export const CENTRE_LEGACY_ZERO = { ...CENTRE_EMPTY, teamHealth: { status: 'green', averageScore: 0, reviewedCalls: 0, callsNeedingReview: 0, openAssignments: 2, overdueAssignments: 1 } }

export const ACTIVITY = [R1, R2, R3, '44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777'].map((id, i) => ({ rep_id: id, rep_name: id, activities_created: 10 - i, activities_completed: 5 }))

type Failure = number | 'network'
export type Mock = {
  trend?: 'full' | 'single' | 'empty' | Failure
  centre?: 'full' | 'empty' | 'legacy-zero' | Failure
  /** 'fail-after-gate': the role gate's probe of /v1/admin/config succeeds, the Insights thresholds request then fails (500). */
  thresholds?: 'ok' | 'missing' | 'fail-after-gate' | Failure
  activity?: 'ok' | 'empty' | Failure
  /** rep-specific trend (used when ?repId= is present) */
  repTrend?: typeof TREND_FULL
  assignments?: unknown[] | Failure | 'no-list' | 'ok-false'
  roster?: 'ok' | Failure
  tier?: string
  requests?: string[]
}

const j = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) })
const fail = (route: Route, f: Failure) => (f === 'network' ? route.abort() : route.fulfill(j({ ok: false, error: f === 403 ? 'forbidden' : 'boom: secret backend text' }, f)))

export async function setupManager(page: Page, o: Mock = {}) {
  let firstConfigAt = 0
  await fakeManagerSession(page)
  await page.route(/supabase\.co/, (r) => r.abort())
  await page.routeWebSocket(/supabase\.co/, (ws) => ws.close())
  await page.route('**/api/proxy/**', async (route) => {
    const u = route.request().url()
    const path = new URL(u).pathname.replace('/api/proxy', '')
    o.requests?.push(path + new URL(u).search)

    if (path.startsWith('/v1/assignments/manager')) {
      if (route.request().method() === 'PATCH') return route.fulfill(j({ ok: true, item: { id: 'a1', status: 'completed' } }))
      const a = o.assignments
      if (typeof a === 'number' || a === 'network') return fail(route, a)
      if (a === 'no-list') return route.fulfill(j({ ok: true }))
      if (a === 'ok-false') return route.fulfill(j({ ok: false, error: 'x' }, 200))
      return route.fulfill(j({ ok: true, items: a ?? [] }))
    }
    if (path.startsWith('/v1/team/members')) {
      if (typeof o.roster === 'number' || o.roster === 'network') return fail(route, o.roster)
      return route.fulfill(j({ ok: true, items: ROSTER, seats: {}, warnings: [] }))
    }
    if (path.startsWith('/v1/team/users')) return route.fulfill(j({ ok: true, items: ROSTER }))
    if (path.startsWith('/v1/crm/analytics/score-trend')) {
      const t = o.trend ?? 'full'
      if (typeof t === 'number' || t === 'network') return fail(route, t)
      const repScoped = new URL(u).searchParams.get('repId')
      const rows = repScoped && o.repTrend ? o.repTrend : t === 'full' ? TREND_FULL : t === 'single' ? TREND_SINGLE : []
      return route.fulfill(j({ ok: true, scope: repScoped ? 'rep' : 'team', trend: rows }))
    }
    if (path.startsWith('/v1/crm/analytics/activity-by-rep')) {
      const a = o.activity ?? 'ok'
      if (typeof a === 'number' || a === 'network') return fail(route, a)
      return route.fulfill(j({ ok: true, reps: a === 'empty' ? [] : ACTIVITY }))
    }
    if (path.startsWith('/v1/manager/command-centre')) {
      const c = o.centre ?? 'full'
      if (typeof c === 'number' || c === 'network') return fail(route, c)
      return route.fulfill(j(c === 'full' ? CENTRE_FULL : c === 'empty' ? CENTRE_EMPTY : CENTRE_LEGACY_ZERO))
    }
    if (path.startsWith('/v1/admin/config')) {
      const t = o.thresholds ?? 'ok'
      if (t === 'fail-after-gate') {
        // The gate (and React strict-mode's second probe) fire together at load; the page's own request arrives later.
        if (!firstConfigAt) firstConfigAt = Date.now()
        if (Date.now() - firstConfigAt > 120) return fail(route, 500)
        await new Promise((r) => setTimeout(r, 300))
        return route.fulfill(j({ ok: true, is_manager: true, config: {}, scoring: { low: 65, critical: 45 } }))
      }
      if (typeof t === 'number' || t === 'network') return fail(route, t)
      if (t === 'missing') return route.fulfill(j({ ok: true, config: {}, scoring: { low: null, critical: null }, is_manager: true }))
      return route.fulfill(j({ ok: true, is_manager: true, config: { low_score_threshold: 65, critical_score_threshold: 45 }, scoring: { low: 65, critical: 45 } }))
    }
    if (path.startsWith('/v1/reps/me')) return route.fulfill(j({ ok: true, id: '00000000-0000-4000-8000-000000000001', tier: o.tier ?? 'Manager', is_manager: true }))
    return route.fulfill(j({ ok: true, items: [], headline: {}, reps_all: [] }))
  })
}
