import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clock, looksLikeId, humaniseSlug, safeLabel, typeLabel, normaliseMoments, rankMoments, normaliseSegments, segmentIndexAt,
  markersBySegment, hasTimedSegments, transcriptEmptyCopy,
} from '../../src/lib/call-moments-model.ts'

const UUID = '3f2b8c1e-5a4d-4c9b-8e7f-0a1b2c3d4e5f'

test('clock formats m:ss and h:mm:ss and never NaN', () => {
  assert.equal(clock(0), '0:00'); assert.equal(clock(83.9), '1:23'); assert.equal(clock(3600), '1:00:00'); assert.equal(clock(3725), '1:02:05')
  for (const bad of [null, undefined, NaN, -1, Infinity]) assert.equal(clock(bad as number), '—')
})

test('ids never become labels', () => {
  assert.equal(looksLikeId(UUID), true); assert.equal(looksLikeId('Acme Ltd'), false)
  assert.equal(safeLabel(UUID, 'Contact'), 'Contact'); assert.equal(safeLabel('  ', 'Contact'), 'Contact'); assert.equal(safeLabel(`Acme ${UUID}`, 'Account'), 'Account')
  assert.equal(safeLabel(' Priya Nair ', 'Contact'), 'Priya Nair'); assert.equal(safeLabel(null, 'Account'), 'Account')
})

test('slugs are humanised', () => {
  assert.equal(humaniseSlug('intro-basics'), 'Intro basics'); assert.equal(humaniseSlug('objection_too_expensive'), 'Objection too expensive'); assert.equal(humaniseSlug(''), '')
  assert.equal(typeLabel('price_objection'), 'Price objection'); assert.equal(typeLabel(undefined), 'Moment'); assert.equal(typeLabel('moment'), 'Moment')
})

test('moments: untrusted input is reduced to valid items only', () => {
  assert.deepEqual(normaliseMoments(undefined), []); assert.deepEqual(normaliseMoments('x'), []); assert.deepEqual(normaliseMoments({}), [])
  const m = normaliseMoments([
    null, 'str', { text: '' }, { text: '   ' }, { type: 'x' },
    { type: 'price_objection', timestamp: 83, text: 'Budget concern', severity: 'high' },
    { type: 'rapport', timestamp: 'late', text: 'Nice opener', severity: 'bogus' },
    { text: 'No time', timestamp: -4 },
  ])
  assert.equal(m.length, 3)
  assert.deepEqual(m.map((x) => [x.label, x.seconds, x.severity]), [['Price objection', 83, 'high'], ['Rapport', null, 'medium'], ['Moment', null, 'medium']])
  assert.ok(normaliseMoments([{ text: 'x'.repeat(5000) }])[0].text.length <= 600)
})

test('ranking: severity first, then earliest; untimed last; nothing lost', () => {
  const ms = normaliseMoments([
    { text: 'a', timestamp: 50, severity: 'low' }, { text: 'b', timestamp: 90, severity: 'high' }, { text: 'c', timestamp: 10, severity: 'high' },
    { text: 'd', severity: 'high' }, { text: 'e', timestamp: 5, severity: 'medium' },
  ])
  const { top, rest } = rankMoments(ms, 3)
  assert.deepEqual(top.map((x) => x.text), ['c', 'b', 'd'])
  assert.deepEqual(rest.map((x) => x.text), ['e', 'a'])
  assert.equal(top.length + rest.length, ms.length)
  assert.deepEqual(rankMoments([], 3), { top: [], rest: [] })
  assert.deepEqual(rankMoments(ms, 0).top, [])
})

test('segments keep their ORIGINAL index and drop empties', () => {
  const s = normaliseSegments([{ speaker: 'Rep', text: 'Hi', start_sec: 0 }, { text: '' }, { speaker: '', text: 'Hello', start_sec: 4.2 }, null, { speaker: 'Prospect', text: 'No time', start_sec: 'x' }])
  assert.deepEqual(s.map((x) => [x.index, x.speaker, x.start]), [[0, 'Rep', 0], [2, 'Speaker', 4.2], [4, 'Prospect', null]])
  assert.deepEqual(normaliseSegments(undefined), []); assert.equal(hasTimedSegments(s), true); assert.equal(hasTimedSegments([{ index: 0, start: null, speaker: 'x', text: 'y' }]), false)
})

test('segmentIndexAt: last segment at or before the time; null when untimed or not started', () => {
  const s = normaliseSegments([{ text: 'a', start_sec: 0 }, { text: 'b', start_sec: 10 }, { text: 'c', start_sec: 25 }])
  assert.equal(segmentIndexAt(s, 0), 0); assert.equal(segmentIndexAt(s, 9.9), 0); assert.equal(segmentIndexAt(s, 10), 1); assert.equal(segmentIndexAt(s, 999), 2)
  assert.equal(segmentIndexAt(s, -1), null); assert.equal(segmentIndexAt(s, NaN), null); assert.equal(segmentIndexAt([], 5), null)
  assert.equal(segmentIndexAt(normaliseSegments([{ text: 'a' }]), 5), null)
  assert.equal(segmentIndexAt(normaliseSegments([{ text: 'late', start_sec: 30 }]), 5), null)
})

test('markers: pins and moments land in the segment they fall in; unmatched ones are omitted, never mis-placed', () => {
  const segs = normaliseSegments([{ text: 'a', start_sec: 0 }, { text: 'b', start_sec: 20 }, { text: 'c', start_sec: 40 }])
  const ms = normaliseMoments([{ text: 'x', timestamp: 22, type: 'price_objection' }, { text: 'untimed' }])
  const map = markersBySegment(segs, ms, [{ t: 41, note: 'Great close' }, { t: 5, note: null }, { t: NaN, note: 'bad' }])
  assert.deepEqual(map[1].map((m) => [m.kind, m.label]), [['moment', 'Price objection']])
  assert.deepEqual(map[2].map((m) => [m.kind, m.label]), [['pin', 'Great close']])
  assert.deepEqual(map[0].map((m) => [m.kind, m.label]), [['pin', 'Pin']])
  assert.equal(Object.values(map).flat().length, 3)
  assert.deepEqual(markersBySegment([], ms, [{ t: 3, note: 'x' }]), {})
})

test('transcript empty copy is honest by status', () => {
  assert.match(transcriptEmptyCopy('failed').message, /processing didn’t finish/)
  for (const s of ['queued', 'processing', 'processed', 'scoring']) assert.match(transcriptEmptyCopy(s).message, /isn’t ready yet/)
  assert.equal(transcriptEmptyCopy('scored').message, 'No transcript has been generated for this call yet.')
  assert.equal(transcriptEmptyCopy(undefined).message, 'No transcript has been generated for this call yet.')
})
