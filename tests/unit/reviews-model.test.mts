import test from 'node:test'
import assert from 'node:assert/strict'
import { ageDays, ageLabel, bandOf, isLongWait, summariseReviews, apiRepName, filterReviews, sortReviews } from '../../src/lib/reviews-model.ts'

const NOW = new Date('2026-11-03T12:00:00')
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()
const R = (o: object) => ({ callId: Math.random().toString(36).slice(2), repId: 'r1', title: 'Call', overallScore: 60, createdAt: ago(0), reasons: [], ...o }) as any
const name = (i: any) => (i.repId === 'r1' ? 'Alex Johnson' : i.repId === 'r2' ? 'Sam Rivera' : 'Team member')

test('age in calendar days, labels, and unknown dates', () => {
  assert.equal(ageDays(ago(0), NOW), 0)
  assert.equal(ageDays(ago(4), NOW), 4)
  assert.equal(ageDays(undefined, NOW), null)
  assert.equal(ageDays('nonsense', NOW), null)
  assert.equal(ageLabel(ago(0), NOW), 'Today')
  assert.equal(ageLabel(ago(1), NOW), 'Yesterday')
  assert.equal(ageLabel(ago(5), NOW), '5 days ago')
  assert.equal(ageLabel(ago(15), NOW), '2 weeks ago')
  assert.equal(ageLabel(null, NOW), 'Date unknown')
})

test('score bands follow the shared 55/70 thresholds', () => {
  assert.equal(bandOf(54), 'low')
  assert.equal(bandOf(55), 'mid')
  assert.equal(bandOf(69), 'mid')
  assert.equal(bandOf(70), 'high')
  assert.equal(bandOf(null), null)
})

test('long wait is derived from call age only, unknown dates are never flagged', () => {
  assert.equal(isLongWait(R({ createdAt: ago(2) }), NOW), false)
  assert.equal(isLongWait(R({ createdAt: ago(3) }), NOW), true)
  assert.equal(isLongWait(R({ createdAt: '' }), NOW), false)
})

test('summary counts', () => {
  const s = summariseReviews([R({ overallScore: 40, createdAt: ago(5) }), R({ overallScore: 80 }), R({ overallScore: 50, createdAt: ago(1) })], NOW)
  assert.deepEqual(s, { waiting: 3, waitingLong: 1, lowScore: 2 })
  assert.deepEqual(summariseReviews([], NOW), { waiting: 0, waitingLong: 0, lowScore: 0 })
})

test('API "Unknown rep" is not an identity', () => {
  assert.equal(apiRepName('Unknown rep'), null)
  assert.equal(apiRepName('  '), null)
  assert.equal(apiRepName(undefined), null)
  assert.equal(apiRepName('Alex Johnson'), 'Alex Johnson')
})

test('filters: search by resolved rep name, title, skill, reason; rep; band; age', () => {
  const items = [
    R({ callId: 'a', repId: 'r1', title: 'Acme discovery', weakestSkill: 'Closing', overallScore: 48, createdAt: ago(0), reasons: ['Score below 70'] }),
    R({ callId: 'b', repId: 'r2', title: 'TechFlow demo', weakestSkill: 'Discovery', overallScore: 63, createdAt: ago(4) }),
    R({ callId: 'c', repId: 'r2', title: 'Northwind', overallScore: 82, createdAt: ago(9) }),
  ]
  const ids = (f: object) => filterReviews(items, f, name, NOW).map((i) => i.callId)
  assert.deepEqual(ids({}), ['a', 'b', 'c'])
  assert.deepEqual(ids({ q: 'alex' }), ['a'])
  assert.deepEqual(ids({ q: 'techflow' }), ['b'])
  assert.deepEqual(ids({ q: 'closing' }), ['a'])
  assert.deepEqual(ids({ q: 'below 70' }), ['a'])
  assert.deepEqual(ids({ rep: 'r2' }), ['b', 'c'])
  assert.deepEqual(ids({ band: 'low' }), ['a'])
  assert.deepEqual(ids({ band: 'mid' }), ['b'])
  assert.deepEqual(ids({ band: 'high' }), ['c'])
  assert.deepEqual(ids({ age: 'recent' }), ['a'])
  assert.deepEqual(ids({ age: 'waiting3' }), ['b', 'c'])
  assert.deepEqual(ids({ age: 'waiting7' }), ['c'])
  assert.deepEqual(ids({ rep: 'r2', band: 'mid', q: 'tech' }), ['b'])
  assert.deepEqual(ids({ q: 'zzz' }), [])
})

test('an unknown date never matches an age filter', () => {
  const items = [R({ callId: 'x', createdAt: '' })]
  assert.equal(filterReviews(items, { age: 'waiting3' }, name, NOW).length, 0)
  assert.equal(filterReviews(items, { age: 'recent' }, name, NOW).length, 0)
  assert.equal(filterReviews(items, { age: 'any' }, name, NOW).length, 1)
})

test('sort: lowest score first (ties newest first) or oldest first; input not mutated', () => {
  const items = [R({ callId: 'a', overallScore: 60, createdAt: ago(1) }), R({ callId: 'b', overallScore: 40, createdAt: ago(5) }), R({ callId: 'c', overallScore: 60, createdAt: ago(0) }), R({ callId: 'd', overallScore: 90, createdAt: ago(9) })]
  assert.deepEqual(sortReviews(items, 'score').map((i) => i.callId), ['b', 'c', 'a', 'd'])
  assert.deepEqual(sortReviews(items, 'oldest').map((i) => i.callId), ['d', 'b', 'a', 'c'])
  assert.deepEqual(items.map((i) => i.callId), ['a', 'b', 'c', 'd'])
})
