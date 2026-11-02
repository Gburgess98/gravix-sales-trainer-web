import test from 'node:test'
import assert from 'node:assert/strict'
import { ragFromScore, worstRag, repRag, trendBetween, healthHeadline, biggestMovement, RAG_META } from '../../src/lib/manager-model.ts'

test('ragFromScore uses the overview thresholds', () => {
  assert.equal(ragFromScore(54), 'red')
  assert.equal(ragFromScore(55), 'amber')
  assert.equal(ragFromScore(69), 'amber')
  assert.equal(ragFromScore(70), 'green')
  assert.equal(ragFromScore(null), null)
  assert.equal(ragFromScore(Number.NaN), null)
})

test('worstRag picks the most severe and ignores unknowns', () => {
  assert.equal(worstRag('green', 'red', 'amber'), 'red')
  assert.equal(worstRag(null, undefined, 'green'), 'green')
  assert.equal(worstRag(null), null)
})

test('repRag combines API risk, score band and overdue coaching', () => {
  assert.equal(repRag({ avgScore: 85 }), 'green')
  assert.equal(repRag({ avgScore: 85, overdue: 1 }), 'amber')
  assert.equal(repRag({ avgScore: 85, riskLevel: 'red' }), 'red')
  assert.equal(repRag({ avgScore: 40, riskLevel: 'green' }), 'red')
  assert.equal(repRag({}), null)
})

test('trendBetween thresholds at ±3 and tolerates missing data', () => {
  assert.deepEqual(trendBetween(74, 70), { dir: 'up', delta: 4 })
  assert.deepEqual(trendBetween(66, 70), { dir: 'down', delta: -4 })
  assert.deepEqual(trendBetween(71, 70), { dir: 'flat', delta: 1 })
  assert.equal(trendBetween(null, 70), null)
  assert.equal(trendBetween(70, undefined), null)
})

test('healthHeadline is one sentence from real counts', () => {
  assert.equal(healthHeadline({ status: 'green', repsNeedingAttention: 0, overdue: 0, callsNeedingReview: 0 }), 'Nothing needs your attention right now.')
  assert.equal(
    healthHeadline({ status: 'red', repsNeedingAttention: 1, overdue: 2, callsNeedingReview: 3 }),
    '1 rep needs attention · 2 assignments are overdue · 3 calls are waiting for review',
  )
  assert.match(healthHeadline({ status: 'amber', repsNeedingAttention: 0, overdue: 0, callsNeedingReview: 0 }), /below target/)
})

test('biggestMovement picks the largest absolute delta, null without comparisons', () => {
  const skills = [
    { skill: 'Discovery', averageScore: 70, delta: 2 },
    { skill: 'Objection', averageScore: 58, previousAverageScore: 66, delta: -8 },
    { skill: 'Close', averageScore: 80, delta: null },
  ]
  assert.equal(biggestMovement(skills)?.skill, 'Objection')
  assert.equal(biggestMovement([{ skill: 'x', averageScore: 1, delta: null }]), null)
})

test('RAG labels are the shared status language', () => {
  assert.deepEqual(Object.values(RAG_META).map((m) => m.label), ['On track', 'Needs attention', 'At risk'])
})
