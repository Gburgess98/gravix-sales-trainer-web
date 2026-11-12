// Insights command-centre model: missing data is never zero, an empty window is never healthy, thresholds are never invented.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_PERIOD, bandOf, callsLabel, kpisFor, num, outcomeOf, parseCentre, parsePeriod, parseThresholds, parseTrend, summariseTrend, trendShape,
} from '../../src/lib/insights-command.ts'

const centreJson = (h: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  ok: true,
  teamHealth: { status: 'green', averageScore: 66, scoredCalls: 15, reviewedCalls: 4, callsNeedingReview: 3, openAssignments: 5, overdueAssignments: 2, ...h },
  repsNeedingAttention: [], weakestSkills: [], coachingImpact: { completedAssignments: 7 }, ...extra,
})

test('period: only 30/90/365; default 365; junk falls back', () => {
  assert.equal(DEFAULT_PERIOD, 365)
  for (const [v, want] of [['30', 30], ['90', 90], ['365', 365], [null, 365], [undefined, 365], ['7', 365], ['abc', 365], ['3650', 365], ['', 365], [30, 30]] as const) assert.equal(parsePeriod(v as any), want, String(v))
})

test('num never turns missing into 0', () => {
  for (const v of [null, undefined, '', '  ', NaN, Infinity, true, {}, []]) assert.equal(num(v), null, String(v))
  assert.equal(num(0), 0)
  assert.equal(num('72'), 72)
})

test('outcomeOf: 403 is permission, 401 session, 5xx/network/ok:false are errors', () => {
  assert.equal(outcomeOf(200, true), 'ok')
  assert.equal(outcomeOf(403), 'permission')
  assert.equal(outcomeOf(401), 'unauthenticated')
  assert.equal(outcomeOf(500), 'error')
  assert.equal(outcomeOf(404), 'error')
  assert.equal(outcomeOf(null), 'error')
  assert.equal(outcomeOf(200, false), 'error')
})

test('trend: keeps real points + counts; drops unreadable points instead of zeroing them; sorts by date', () => {
  const pts = parseTrend({ trend: [{ date: '2026-10-02', avg_score: 70, count: 3 }, { date: '2026-10-01', avg_score: 0, count: 1 }, { date: '2026-10-03', avg_score: null, count: 2 }, { date: 'x', avg_score: 50 }, { date: '2026-10-04', avg_score: 'n/a' }] })
  assert.deepEqual(pts, [{ date: '2026-10-01', avg: 0, count: 1 }, { date: '2026-10-02', avg: 70, count: 3 }])
  assert.deepEqual(parseTrend({ trend: [{ date: '2026-10-01', avg_score: 60 }] }), [{ date: '2026-10-01', avg: 60, count: null }], 'old API: count stays null, not 0')
  assert.deepEqual(parseTrend(null), [])
  assert.deepEqual(parseTrend({ trend: 'nope' }), [])
})

test('trend summary: sample size and weighted average only when EVERY point reports a count', () => {
  const s = summariseTrend([{ date: '2026-10-01', avg: 80, count: 1 }, { date: '2026-10-02', avg: 60, count: 3 }])
  assert.equal(s.scoredCalls, 4)
  assert.equal(s.weightedAverage, 65)
  assert.equal(s.lastDate, '2026-10-02')
  const partial = summariseTrend([{ date: '2026-10-01', avg: 80, count: 1 }, { date: '2026-10-02', avg: 60, count: null }])
  assert.equal(partial.scoredCalls, null)
  assert.equal(partial.weightedAverage, null)
  const empty = summariseTrend([])
  assert.deepEqual(empty, { days: 0, scoredCalls: null, lastDate: null, weightedAverage: null })
})

test('trend shape: empty / single / series', () => {
  assert.equal(trendShape([]), 'empty')
  assert.equal(trendShape([{ date: '2026-10-01', avg: 1, count: 1 }]), 'single')
  assert.equal(trendShape([{ date: '2026-10-01', avg: 1, count: 1 }, { date: '2026-10-02', avg: 1, count: 1 }]), 'series')
})

test('command centre: real figures, real zeros preserved', () => {
  const c = parseCentre(centreJson({ callsNeedingReview: 0, overdueAssignments: 0, openAssignments: 0 }))!
  assert.equal(c.averageScore, 66)
  assert.equal(c.scoredCalls, 15)
  assert.equal(c.callsNeedingReview, 0, 'a real zero stays zero')
  assert.equal(c.overdueAssignments, 0)
  assert.equal(c.openAssignments, 0)
  assert.equal(c.completedAssignments, 7)
})

test('command centre: null average and zero scored calls → unavailable, never 0', () => {
  const c = parseCentre(centreJson({ averageScore: null, scoredCalls: 0, callsNeedingReview: 0, openAssignments: 2, overdueAssignments: 1 }))!
  assert.equal(c.averageScore, null)
  assert.equal(c.scoredCalls, 0)
  assert.equal(c.openAssignments, 2, 'other real counts are untouched')
})

test('command centre: REGRESSION — an average of 0 with no confirmed sample (older API) is unavailable, and 0 scored calls overrides any average', () => {
  assert.equal(parseCentre(centreJson({ averageScore: 0, scoredCalls: undefined }))!.averageScore, null)
  assert.equal(parseCentre(centreJson({ averageScore: 0, scoredCalls: 0 }))!.averageScore, null)
  assert.equal(parseCentre(centreJson({ averageScore: 55, scoredCalls: 0 }))!.averageScore, null)
  assert.equal(parseCentre(centreJson({ averageScore: 0, scoredCalls: 3 }))!.averageScore, 0, 'a genuine 0 over a real sample is kept')
})

test('command centre: missing numbers are null, malformed bodies are null', () => {
  const c = parseCentre({ ok: true, teamHealth: {} })!
  assert.deepEqual([c.averageScore, c.scoredCalls, c.callsNeedingReview, c.openAssignments, c.overdueAssignments, c.completedAssignments], [null, null, null, null, null, null])
  assert.equal(parseCentre(null), null)
  assert.equal(parseCentre({ ok: false }), null)
  assert.equal(parseCentre({ ok: true }), null)
})

test('command centre: attention reps and skills keep their real reasons, trends and weak-call counts', () => {
  const c = parseCentre(centreJson({}, {
    repsNeedingAttention: [{ repId: 'r1', repName: 'Alex', averageScore: 52, riskLevel: 'red', riskReason: 'Average score below 55', recommendedAction: 'Practise discovery' }, { repId: 'r2', repName: ' ', averageScore: null, riskLevel: 'amber', riskReason: 'Average score below 70' }, { repId: 'r3', riskLevel: 'green', riskReason: 'On track' }],
    weakestSkills: [{ skill: 'Discovery', count: 4, averageScore: 48, previousAverageScore: 55, trend: 'down', trendLabel: '↓ from 55' }, { skill: 'Closing', count: 1, averageScore: 60, trend: 'new', trendLabel: 'New this period' }, { skill: 'X', trend: 'sideways' }],
  }))!
  assert.equal(c.repsNeedingAttention.length, 2, 'green reps are never listed as needing attention')
  assert.deepEqual(c.repsNeedingAttention[0], { repId: 'r1', repName: 'Alex', averageScore: 52, level: 'red', reason: 'Average score below 55', action: 'Practise discovery' })
  assert.equal(c.repsNeedingAttention[1].repName, null)
  assert.equal(c.repsNeedingAttention[1].averageScore, null, 'a missing rep average stays null')
  assert.equal(c.weakestSkills[0].trend, 'down')
  assert.equal(c.weakestSkills[0].weakCalls, 4)
  assert.equal(c.weakestSkills[1].trend, 'new')
  assert.equal(c.weakestSkills[2].trend, null, 'an unknown trend is not invented')
})

test('thresholds: read from admin/config only; invalid or inconsistent → unavailable (no default target)', () => {
  assert.deepEqual(parseThresholds({ ok: true, scoring: { low: 65, critical: 45 } }), { low: 65, critical: 45 })
  assert.deepEqual(parseThresholds({ ok: true, config: { low_score_threshold: 70, critical_score_threshold: 50 } }), { low: 70, critical: 50 })
  for (const j of [null, { ok: false }, { ok: true }, { ok: true, scoring: { low: null, critical: null } }, { ok: true, scoring: { low: 40, critical: 60 } }, { ok: true, scoring: { low: 120, critical: 10 } }, { ok: true, scoring: { low: 'x', critical: 1 } }]) assert.equal(parseThresholds(j), null, JSON.stringify(j))
})

test('gauge band: placed only against real thresholds; null average or thresholds → no band; never "healthy"', () => {
  const t = { low: 65, critical: 45 }
  assert.equal(bandOf(30, t), 'critical')
  assert.equal(bandOf(45, t), 'low')
  assert.equal(bandOf(64, t), 'low')
  assert.equal(bandOf(65, t), 'above')
  assert.equal(bandOf(null, t), null)
  assert.equal(bandOf(80, null), null)
})

test('KPIs: team uses the command centre; unavailable stays unavailable; empty window says so', () => {
  const full = parseCentre(centreJson({}))!
  const k = kpisFor('team', full, [{ date: '2026-10-01', avg: 70, count: 15 }])
  assert.equal(k.averageScore, 66)
  assert.equal(k.scoredCalls, 15)
  const empty = parseCentre(centreJson({ averageScore: null, scoredCalls: 0 }))!
  const ke = kpisFor('team', empty, [])
  assert.equal(ke.averageScore, null)
  assert.equal(ke.scoredCalls, 0)
  assert.equal(ke.averageNote, 'No scored calls in this period')
  const none = kpisFor('team', null, [])
  assert.equal(none.averageScore, null)
  assert.equal(none.scoredCalls, null, 'no centre and no trend → not 0, unknown')
})

test('KPIs: rep scope uses the rep trend (call-weighted); empty rep trend → no score, 0 scored calls', () => {
  const k = kpisFor('rep', parseCentre(centreJson({}))!, [{ date: '2026-10-01', avg: 80, count: 1 }, { date: '2026-10-02', avg: 60, count: 3 }])
  assert.equal(k.averageScore, 65)
  assert.equal(k.scoredCalls, 4)
  const e = kpisFor('rep', parseCentre(centreJson({}))!, [])
  assert.equal(e.averageScore, null)
  assert.equal(e.scoredCalls, 0)
  const old = kpisFor('rep', null, [{ date: '2026-10-01', avg: 80, count: null }])
  assert.equal(old.averageScore, null, 'old API without counts: no unweighted guess')
  assert.equal(old.scoredCalls, null)
})

test('callsLabel', () => {
  assert.equal(callsLabel(1), '1 call')
  assert.equal(callsLabel(12), '12 calls')
  assert.equal(callsLabel(0), '0 calls')
  assert.equal(callsLabel(null), 'sample size not reported')
})
