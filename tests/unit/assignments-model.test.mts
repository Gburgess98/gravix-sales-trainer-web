import test from 'node:test'
import assert from 'node:assert/strict'
import { statusOf, dueStateOf, typeLabel, evidenceOf, summarise, filterAssignments, sortAssignments } from '../../src/lib/assignments-model.ts'

const NOW = new Date('2026-11-03T12:00:00')
const iso = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString()
const A = (o: object) => ({ id: Math.random().toString(36).slice(2), status: 'open', ...o }) as any
const name = (id?: string | null) => (id === 'r1' ? 'Alex Johnson' : id === 'r2' ? 'Sam Rivera' : 'Team member')

test('status: completed/reviewed, cancelled, overdue by due date, otherwise open', () => {
  assert.equal(statusOf(A({ status: 'completed' }), NOW), 'completed')
  assert.equal(statusOf(A({ status: 'reviewed' }), NOW), 'completed')
  assert.equal(statusOf(A({ status: 'cancelled', due_at: iso(-3) }), NOW), 'cancelled')
  assert.equal(statusOf(A({ due_at: iso(-1) }), NOW), 'overdue')
  assert.equal(statusOf(A({ due_at: iso(2) }), NOW), 'open')
  assert.equal(statusOf(A({ status: 'assigned' }), NOW), 'open')
  assert.equal(statusOf(A({ status: 'completed', due_at: iso(-9) }), NOW), 'completed')
})

test('due state buckets', () => {
  assert.equal(dueStateOf(A({}), NOW), 'none')
  assert.equal(dueStateOf(A({ due_at: iso(-1) }), NOW), 'overdue')
  assert.equal(dueStateOf(A({ due_at: new Date('2026-11-03T18:00:00').toISOString() }), NOW), 'today')
  assert.equal(dueStateOf(A({ due_at: iso(4) }), NOW), 'week')
  assert.equal(dueStateOf(A({ due_at: iso(20) }), NOW), 'later')
  assert.equal(dueStateOf(A({ due_at: 'nonsense' }), NOW), 'none')
})

test('summary counts never double-count overdue as open', () => {
  const list = [A({ due_at: iso(-1) }), A({ due_at: iso(3) }), A({}), A({ status: 'completed' }), A({ status: 'cancelled' })]
  assert.deepEqual(summarise(list, NOW), { open: 2, overdue: 1, completed: 1, total: 5 })
})

test('evidence: sparring proof, call source, otherwise null — nothing invented', () => {
  assert.equal(evidenceOf(A({ meta: { completed_via: 'sparring_session_match', completion_score: 81.6 } }))?.detail, 'Completed from a matched sparring session · score 82%')
  assert.equal(evidenceOf(A({ meta: { source_call_id: 'c9' } }))?.callId, 'c9')
  assert.equal(evidenceOf(A({ type: 'call_review', target_id: 'c7' }))?.callId, 'c7')
  assert.equal(evidenceOf(A({ type: 'drill' })), null)
  assert.equal(typeLabel('call_review'), 'Call review')
  assert.equal(typeLabel(null), 'Assignment')
})

test('filters: status, rep, type, due and search combine', () => {
  const list = [
    A({ id: 'a', title: 'Objection drill', rep_id: 'r1', type: 'drill', due_at: iso(-1) }),
    A({ id: 'b', title: 'Closing practice', rep_id: 'r2', type: 'sparring', due_at: iso(3) }),
    A({ id: 'c', title: 'Budget review', rep_id: 'r1', type: 'call_review', status: 'completed', meta: { coaching_notes: 'anchor on ROI' } }),
  ]
  const ids = (f: any) => filterAssignments(list, f, name, NOW).map((a: any) => a.id)
  assert.deepEqual(ids({ status: 'overdue' }), ['a'])
  assert.deepEqual(ids({ status: 'all', rep: 'r1' }), ['a', 'c'])
  assert.deepEqual(ids({ type: 'sparring' }), ['b'])
  assert.deepEqual(ids({ due: 'week' }), ['b'])
  assert.deepEqual(ids({ q: 'sam' }), ['b'])
  assert.deepEqual(ids({ q: 'roi' }), ['c'])
  assert.deepEqual(ids({ q: 'alex', status: 'completed' }), ['c'])
  assert.deepEqual(ids({}), ['a', 'b', 'c'])
})

test('sort: overdue first, open by soonest due, completed newest first', () => {
  const list = [
    A({ id: 'done-old', status: 'completed', completed_at: iso(-10) }),
    A({ id: 'later', due_at: iso(5) }),
    A({ id: 'overdue', due_at: iso(-2) }),
    A({ id: 'soon', due_at: iso(1) }),
    A({ id: 'done-new', status: 'completed', completed_at: iso(-1) }),
    A({ id: 'nodate' }),
  ]
  assert.deepEqual(sortAssignments(list, NOW).map((a: any) => a.id), ['overdue', 'soon', 'later', 'nodate', 'done-new', 'done-old'])
})

import { classifyAssignmentsResult } from '../../src/lib/assignments-model.ts'

test('load outcome: every cause is its own state — permission, session, server, network', () => {
  assert.equal(classifyAssignmentsResult(403, { ok: false, error: 'forbidden_not_manager' }).failure?.kind, 'permission')
  assert.equal(classifyAssignmentsResult(401, null).failure?.kind, 'unauthenticated')
  assert.equal(classifyAssignmentsResult(500, { ok: false }).failure?.kind, 'server')
  assert.equal(classifyAssignmentsResult(502, null).failure?.kind, 'server')
  assert.equal(classifyAssignmentsResult(404, null).failure?.kind, 'server')
  assert.equal(classifyAssignmentsResult(200, { ok: false, error: 'x' }).failure?.kind, 'server')
  assert.equal(classifyAssignmentsResult(null, null).failure?.kind, 'network')
})

test('load outcome: permission is calm and not retryable; server/network are retryable; messages carry no raw error text', () => {
  const p = classifyAssignmentsResult(403, { ok: false, error: 'forbidden_not_manager' }).failure!
  assert.equal(p.retryable, false)
  assert.match(p.title, /don’t have access/)
  assert.ok(!/forbidden|403|error/i.test(p.title + p.body))
  assert.equal(classifyAssignmentsResult(500, { error: 'pg: connection refused' }).failure!.retryable, true)
  assert.ok(!/pg|refused/i.test(JSON.stringify(classifyAssignmentsResult(500, { error: 'pg: connection refused' }).failure)))
  assert.equal(classifyAssignmentsResult(null, null).failure!.retryable, true)
})

test('load outcome: rows pass through (any manager tier — the web never filters by tier); empty is empty, malformed is a server fault', () => {
  const rows = [{ id: 'a1', title: 't', status: 'assigned' }, { id: 'a2', title: 'u', status: 'completed' }]
  assert.deepEqual(classifyAssignmentsResult(200, { ok: true, items: rows }), { items: rows, failure: null })
  assert.deepEqual(classifyAssignmentsResult(200, { ok: true, assignments: rows }).items, rows)
  assert.deepEqual(classifyAssignmentsResult(200, { ok: true, items: [] }), { items: [], failure: null })
  assert.equal(classifyAssignmentsResult(200, { ok: true }).failure?.kind, 'server', 'a 200 with no list is not "no assignments"')
  assert.equal(classifyAssignmentsResult(200, 'oops').failure?.kind, 'server')
})
