import { test } from 'node:test'
import assert from 'node:assert/strict'
import { callState, scoreTone, formatDuration, formatCallDate, firstName, greetingFor, coachingPriorities } from '../../src/lib/ds-model.ts'

test('call state maps free-form status onto three UI states', () => {
  assert.equal(callState('failed').kind, 'failed')
  assert.equal(callState('ERROR').tone, 'bad')
  for (const s of ['processing', 'queued', 'running', 'pending']) assert.equal(callState(s).kind, 'processing')
  for (const s of ['scored', 'completed', 'processed', '', null, undefined]) assert.equal(callState(s as string).kind, 'scored')
})

test('score tone: 80+ good, 60-79 warn, <60 bad, missing neutral', () => {
  assert.deepEqual([80, 79, 60, 59, 0].map(scoreTone), ['good', 'warn', 'warn', 'bad', 'bad'])
  assert.equal(scoreTone(null), 'neutral')
  assert.equal(scoreTone(NaN), 'neutral')
})

test('duration prefers ms, falls back to seconds, null when unknown', () => {
  assert.equal(formatDuration(125_000, null), '2m 05s')
  assert.equal(formatDuration(null, 45), '45s')
  assert.equal(formatDuration(null, null), null)
  assert.equal(formatDuration(0, 0), null)
})

test('call date is relative for today/yesterday and tolerant of bad input', () => {
  const now = new Date(2026, 10, 2, 15, 0)
  assert.match(formatCallDate(new Date(2026, 10, 2, 9, 5).toISOString(), now)!, /^Today, /)
  assert.equal(formatCallDate(new Date(2026, 10, 1, 9, 5).toISOString(), now), 'Yesterday')
  assert.match(formatCallDate(new Date(2026, 9, 12).toISOString(), now)!, /12 Oct/)
  assert.match(formatCallDate(new Date(2025, 9, 12).toISOString(), now)!, /2025/)
  assert.equal(formatCallDate('nope', now), null)
  assert.equal(formatCallDate(null, now), null)
})

test('greeting and first name', () => {
  assert.deepEqual([6, 12, 17, 18, 23].map(greetingFor), ['Good morning', 'Good afternoon', 'Good afternoon', 'Good evening', 'Good evening'])
  assert.equal(firstName('  Dana Scully '), 'Dana')
  assert.equal(firstName(''), null)
  assert.equal(firstName(undefined), null)
})

test('coaching priorities: lowest-scoring stages first, max three, nothing invented', () => {
  const stages = [
    { label: 'Intro', score: 82, note: null },
    { label: 'Discovery', score: 48, note: 'Ask about budget earlier' },
    { label: 'Objection', score: 61, note: 'Acknowledge before answering' },
    { label: 'Close', score: 55, note: null },
    { label: 'Empty', score: null, note: null },
  ]
  assert.deepEqual(coachingPriorities(stages).map((s) => s.label), ['Discovery', 'Close', 'Objection'])
  assert.deepEqual(coachingPriorities([{ label: 'X', score: null, note: null }]), [])
  assert.equal(coachingPriorities(stages, 1).length, 1)
})
