// Pure rep-progress model shared by Home and Progress.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeStreak, skillStatus, trendDelta, trendDirection, xpLevel } from '../../src/lib/progress-model.ts'

const pts = (...v: number[]) => v.map((voice_score, i) => ({ date: `d${i}`, voice_score }))

test('trendDirection needs 4+ points and a >3 point move', () => {
  assert.equal(trendDirection(pts(50, 60, 70)), 'stable')
  assert.equal(trendDirection(pts(50, 50, 50, 50, 50, 50, 60, 60, 60)), 'improving')
  assert.equal(trendDirection(pts(70, 70, 70, 70, 60, 60, 60)), 'declining')
  assert.equal(trendDirection(pts(60, 60, 60, 60, 61, 61, 61)), 'stable')
})

test('trendDelta is null with fewer than 4 points, otherwise rounded recent-vs-earlier', () => {
  assert.equal(trendDelta(pts(1, 2, 3)), null)
  assert.equal(trendDelta(pts(50, 50, 50, 50, 60, 60, 60)), 10)
})

test('xpLevel: 100 points per level, rank clamps at the top', () => {
  assert.deepEqual(
    (({ level, pct, rank, nextRank }) => ({ level, pct, rank, nextRank }))(xpLevel(0)),
    { level: 0, pct: 0, rank: 'Foundation', nextRank: 'Developing I' },
  )
  assert.equal(xpLevel(250).pct, 50)
  assert.equal(xpLevel(250).level, 2)
  assert.equal(xpLevel(999999).rank, 'Principal')
})

test('skillStatus: weakest area flags attention, strongest improves, otherwise stable', () => {
  assert.equal(skillStatus('discovery', null), 'stable')
  assert.equal(skillStatus('discovery', { weakest_area: { category: 'Discovery' } }), 'attention')
  assert.equal(skillStatus('objection_handling', { strongest_area: { category: 'Objection Handling' } }), 'improving')
  assert.equal(skillStatus('closing', { weakest_area: { category: 'Discovery' } }), 'stable')
})

test('computeStreak counts consecutive local days ending today', () => {
  const day = (offset: number) => {
    const d = new Date()
    d.setDate(d.getDate() - offset)
    return { id: String(offset), status: 'completed', completed_at: d.toISOString() }
  }
  assert.equal(computeStreak([day(0), day(1), day(2)]), 3)
  assert.equal(computeStreak([day(1), day(2)]), 0)
  assert.equal(computeStreak([]), 0)
})
