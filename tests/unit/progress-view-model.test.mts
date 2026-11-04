import test from 'node:test'
import assert from 'node:assert/strict'
import { splitPeriods, summarisePeriods, skillRows, strongestWeakest, chartPoints, isTruncated, headline, skillLabel, comparisonLabel, recentCompleted, completedCounts, openCount, scoredOverall, HISTORY_LIMIT } from '../../src/lib/progress-view-model.ts'

const NOW = new Date('2026-11-04T12:00:00Z')
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()
const P = (d: number, v: number) => ({ date: ago(d), value: v })

test('periods: current = last N days, previous = the N before; older and future points are ignored', () => {
  const { cur, prev } = splitPeriods([P(1, 80), P(29, 70), P(31, 60), P(59, 50), P(61, 10), { date: 'nope', value: 5 }, { date: ago(-3), value: 99 }], 30, NOW)
  assert.deepEqual(cur, [80, 70])
  assert.deepEqual(prev, [60, 50])
})

test('overall 0 is "never scored", not a score', () => {
  assert.deepEqual(scoredOverall([P(1, 0), P(2, 70)]).map((p) => p.value), [70])
  const s = summarisePeriods([P(1, 0), P(2, 0)], 30, NOW)
  assert.equal(s.current.avg, null)
  assert.equal(s.current.count, 0)
})

test('summary: delta only with BOTH periods; ±3 is steady', () => {
  const up = summarisePeriods([P(40, 60), P(35, 62), P(5, 72), P(2, 76)], 30, NOW)
  assert.deepEqual([up.current.avg, up.previous.avg, up.delta, up.direction], [74, 61, 13, 'up'])
  const down = summarisePeriods([P(40, 80), P(3, 70)], 30, NOW)
  assert.deepEqual([down.delta, down.direction], [-10, 'down'])
  const steady = summarisePeriods([P(40, 70), P(3, 72)], 30, NOW)
  assert.deepEqual([steady.delta, steady.direction], [2, 'steady'])
  const onlyCurrent = summarisePeriods([P(3, 72)], 30, NOW)
  assert.deepEqual([onlyCurrent.delta, onlyCurrent.direction], [null, null])
  const none = summarisePeriods([], 30, NOW)
  assert.deepEqual([none.current.avg, none.delta], [null, null])
  assert.equal(summarisePeriods(undefined, 30, NOW).direction, null)
})

test('the 90-day range uses 90-day windows', () => {
  const s = summarisePeriods([P(80, 60), P(100, 50), P(20, 70)], 90, NOW)
  assert.deepEqual([s.current.avg, s.current.count, s.previous.avg, s.previous.count], [65, 2, 50, 1])
})

test('headline and comparison label state exactly what is known', () => {
  assert.equal(headline(summarisePeriods([], 30, NOW)), 'No scored calls yet')
  assert.equal(headline(summarisePeriods([P(40, 70)], 30, NOW)), 'No scored calls in the last 30 days')
  // older history only: say so, don't claim the rep has never been scored
  assert.equal(headline(summarisePeriods([P(200, 70)], 30, NOW), true), 'No scored calls in the last 30 days')
  assert.equal(headline(summarisePeriods([], 30, NOW), false), 'No scored calls yet')
  assert.equal(headline(summarisePeriods([P(3, 70)], 30, NOW)), 'Average call score 70')
  assert.equal(headline(summarisePeriods([P(40, 60), P(3, 70)], 30, NOW)), 'Your call score is up 10 points')
  assert.equal(headline(summarisePeriods([P(40, 71), P(3, 70)], 30, NOW)), 'Your call score is steady')
  assert.equal(headline(summarisePeriods([P(40, 80), P(3, 60)], 30, NOW)), 'Your call score is down 20 points')
  assert.equal(comparisonLabel(summarisePeriods([P(40, 60), P(3, 70)], 30, NOW)), 'Last 30 days: average 70 from 1 call · previous 30 days: 60 from 1 call')
  assert.equal(comparisonLabel(summarisePeriods([P(3, 70), P(4, 72)], 30, NOW)), 'Last 30 days: average 71 from 2 calls · no scored calls in the previous 30 days to compare')
  assert.equal(comparisonLabel(summarisePeriods([], 30, NOW)), '')
})

test('skills: averages, deltas, strongest/weakest only with 2+ differing skills', () => {
  const trends = {
    intro: [P(40, 60), P(3, 80)],
    discovery: [P(3, 70)],
    objection_handling: [P(3, 50), P(40, 60)],
    closing: [],
  }
  const rows = skillRows(trends, 30, NOW)
  assert.deepEqual(rows.map((r) => [r.key, r.avg, r.count, r.prevAvg, r.delta]), [
    ['intro', 80, 1, 60, 20],
    ['discovery', 70, 1, null, null],
    ['objection_handling', 50, 1, 60, -10],
    ['closing', null, 0, null, null],
  ])
  const sw = strongestWeakest(rows)
  assert.equal(sw.strongest?.key, 'intro')
  assert.equal(sw.weakest?.key, 'objection_handling')
  assert.deepEqual(strongestWeakest(skillRows({ intro: [P(3, 80)] }, 30, NOW)), { strongest: null, weakest: null })
  assert.deepEqual(strongestWeakest(skillRows({ intro: [P(3, 70)], closing: [P(2, 70)] }, 30, NOW)), { strongest: null, weakest: null })
  assert.deepEqual(strongestWeakest(skillRows(null, 30, NOW)), { strongest: null, weakest: null })
})

test('chart points: scored calls in the current period only, oldest first', () => {
  const pts = chartPoints([P(40, 60), P(10, 0), P(5, 70.4), P(1, 80)], 30, NOW)
  assert.deepEqual(pts.map((p) => p.score), [70, 80])
})

test('truncation is flagged at the API history limit', () => {
  assert.equal(isTruncated(Array.from({ length: HISTORY_LIMIT }, (_, i) => P(i, 70))), true)
  assert.equal(isTruncated([P(1, 70)]), false)
  assert.equal(isTruncated(undefined), false)
})

test('recent completed: newest first, evidence only when the row carries it, nothing for uncompleted', () => {
  const rows = recentCompleted([
    { id: 'a', title: 'Old', type: 'custom', status: 'completed', completed_at: ago(10) },
    { id: 'b', title: 'Proof', type: 'sparring', status: 'completed', completed_at: ago(1), meta: { completed_via: 'sparring_session_match', completion_score: 81 } },
    { id: 'c', title: 'Open', type: 'custom', status: 'assigned', completed_at: null },
    { id: 'd', title: 'No date', type: 'custom', status: 'completed', completed_at: null },
    { id: 'e', title: '', type: 'call_review', status: 'reviewed', completed_at: ago(3) },
  ] as any)
  assert.deepEqual(rows.map((r) => r.id), ['b', 'e', 'a'])
  assert.equal(rows[0].evidence, 'Completed from a matched sparring session · score 81%')
  assert.equal(rows[1].evidence, null)
  assert.equal(rows[1].title, 'Untitled assignment')
})

test('completed counts and open count', () => {
  const items = [
    { id: '1', status: 'completed', completed_at: ago(2) }, { id: '2', status: 'completed', completed_at: ago(20) },
    { id: '3', status: 'completed', completed_at: ago(60) }, { id: '4', status: 'assigned' }, { id: '5', status: 'cancelled' },
  ] as any
  assert.deepEqual(completedCounts(items, NOW), { d7: 1, d30: 2, total: 3 })
  assert.equal(openCount(items), 1)
})

test('skill labels: slugs become labels, never shown raw', () => {
  assert.equal(skillLabel('objection_handling'), 'Objection handling')
  assert.equal(skillLabel('Objection Handling'), 'Objection handling')
  assert.equal(skillLabel('closing'), 'Closing')
  assert.equal(skillLabel('rapport_building'), 'Rapport building')
  assert.equal(skillLabel(''), null)
  assert.equal(skillLabel(undefined), null)
})
