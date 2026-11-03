import test from 'node:test'
import assert from 'node:assert/strict'
import { summariseScores, completionRate, stageBars, repBars } from '../../src/lib/insights-model.ts'

const pt = (day: string, avg_score: number) => ({ day, avg_score })

test('score summary: mean of daily averages, half-vs-half delta, high/low/latest', () => {
  const s = summariseScores([pt('d1', 60), pt('d2', 62), pt('d3', 70), pt('d4', 72)])!
  assert.equal(s.average, 66)
  assert.equal(s.delta, 10)
  assert.equal(s.latest.day, 'd4')
  assert.equal(s.high.avg_score, 72)
  assert.equal(s.low.avg_score, 60)
})

test('delta needs 4+ days; empty trend is null — no invented figures', () => {
  assert.equal(summariseScores([pt('a', 50), pt('b', 90), pt('c', 70)])!.delta, null)
  assert.equal(summariseScores([]), null)
})

test('completion rate is null with nothing created', () => {
  assert.equal(completionRate(0, 0), null)
  assert.equal(completionRate(8, 6), 75)
})

test('stage bars are relative to the largest count and sorted', () => {
  const bars = stageBars([{ stage: 'Won', count: 2 }, { stage: 'Qualified', count: 8 }, { stage: 'Lost', count: 0 }])
  assert.deepEqual(bars.map((b) => [b.stage, b.pct]), [['Qualified', 100], ['Won', 25], ['Lost', 0]])
  assert.deepEqual(stageBars([{ stage: 'x', count: 0 }])[0].pct, 0)
})

test('rep bars: most-coached first, completion pct capped, label from resolver', () => {
  const rows = [
    { rep_id: 'a', activities_created: 4, activities_completed: 1 },
    { rep_id: 'b', activities_created: 10, activities_completed: 12 },
    { rep_id: 'c', activities_created: 0, activities_completed: 0 },
  ]
  const bars = repBars(rows, (r) => `Rep ${r.rep_id}`)
  assert.deepEqual(bars.map((b) => [b.label, b.pct]), [['Rep b', 100], ['Rep a', 25], ['Rep c', 0]])
})
