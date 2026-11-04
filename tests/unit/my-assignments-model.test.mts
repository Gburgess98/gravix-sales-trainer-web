import test from 'node:test'
import assert from 'node:assert/strict'
import { groupOf, dueStateOf, dueText, compareTodo, typeLabel, originOf, sourceLabel, whyText, managerNote, evidenceOf, reviewedByManager, primaryAction, filterTodo, summarise, sortDone, sparringHref, callReviewHref } from '../../src/lib/my-assignments-model.ts'

const NOW = new Date('2026-11-04T12:00:00')
const iso = (d: number, h = 0) => new Date(NOW.getTime() + d * 86_400_000 + h * 3_600_000).toISOString()
const A = (o: object) => ({ id: 'a' + Math.random().toString(36).slice(2), status: 'assigned', type: 'custom', ...o }) as any

test('groups: assigned/open to do, completed/reviewed done, cancelled neither', () => {
  assert.equal(groupOf(A({})), 'todo')
  assert.equal(groupOf(A({ status: 'open' })), 'todo')
  assert.equal(groupOf(A({ status: 'completed' })), 'done')
  assert.equal(groupOf(A({ status: 'reviewed' })), 'done')
  assert.equal(groupOf(A({ status: 'cancelled' })), 'other')
})

test('due state is calendar-day based; due earlier today is today, not overdue', () => {
  assert.equal(dueStateOf(A({}), NOW), 'none')
  assert.equal(dueStateOf(A({ due_at: iso(0, -3) }), NOW), 'today')
  assert.equal(dueStateOf(A({ due_at: iso(-1) }), NOW), 'overdue')
  assert.equal(dueStateOf(A({ due_at: iso(2) }), NOW), 'upcoming')
  assert.equal(dueStateOf(A({ due_at: 'nonsense' }), NOW), 'none')
})

test('due text', () => {
  assert.equal(dueText(A({}), NOW), 'No due date')
  assert.equal(dueText(A({ due_at: iso(-1) }), NOW), 'Overdue by 1 day')
  assert.equal(dueText(A({ due_at: iso(-3) }), NOW), 'Overdue by 3 days')
  assert.equal(dueText(A({ due_at: iso(0, -2) }), NOW), 'Due today')
  assert.equal(dueText(A({ due_at: iso(1) }), NOW), 'Due tomorrow')
  assert.equal(dueText(A({ due_at: iso(5) }), NOW), 'Due in 5 days')
})

test('to-do order: overdue, today, upcoming (earliest first), no date; ties oldest created', () => {
  const l = [A({ id: 'n', created_at: iso(-9) }), A({ id: 'u2', due_at: iso(5) }), A({ id: 'u1', due_at: iso(2) }), A({ id: 't', due_at: iso(0, 3) }), A({ id: 'o', due_at: iso(-2) }), A({ id: 'n2', created_at: iso(-20) })]
  assert.deepEqual(l.sort((a, b) => compareTodo(a, b, NOW)).map((x) => x.id), ['o', 't', 'u1', 'u2', 'n2', 'n'])
})

test('labels', () => {
  assert.equal(typeLabel('sparring'), 'Sparring drill')
  assert.equal(typeLabel('call_review'), 'Call review')
  assert.equal(typeLabel('custom'), 'Coaching task')
  assert.equal(typeLabel('drill'), 'Drill')
  assert.equal(typeLabel(null), 'Assignment')
})

test('origin, source and why come only from real fields — no invented manager', () => {
  assert.equal(originOf(A({ meta: { threshold_band: 'critical' } })), 'critical')
  assert.equal(originOf(A({ source: 'flagged_call_auto' })), 'auto')
  assert.equal(originOf(A({ flagged_call: true })), 'flagged')
  assert.equal(originOf(A({ source: 'manager_review', manager_id: 'm1' })), 'review')
  assert.equal(originOf(A({ manager_id: 'm1' })), 'manager')
  assert.equal(originOf(A({})), 'unknown')
  assert.equal(sourceLabel(A({ manager_id: 'm1' })), 'From your manager')
  assert.equal(sourceLabel(A({})), null)
  assert.equal(sourceLabel(A({ source: 'flagged_call_auto', manager_id: 'm1' })), 'Created automatically')
  assert.equal(whyText(A({ source: 'manager_review', manager_id: 'm1', meta: { score_overall: 52.4 } })), 'Assigned from a call review (call score 52)')
  assert.equal(whyText(A({ manager_id: 'm1' })), null)
  assert.equal(whyText(A({})), null)
})

test('manager note is the creation note only; never fabricated; reviewed only for status reviewed', () => {
  assert.equal(managerNote(A({ meta: { coaching_notes: '  Focus on pricing  ' } })), 'Focus on pricing')
  assert.equal(managerNote(A({ meta: {} })), null)
  assert.equal(managerNote(A({})), null)
  assert.equal(reviewedByManager(A({ status: 'completed' })), false)
  assert.equal(reviewedByManager(A({ status: 'reviewed' })), true)
})

test('evidence only when the row carries sparring proof', () => {
  assert.deepEqual(evidenceOf(A({ meta: { completed_via: 'sparring_session_match', completion_score: 81.6 } })), { label: 'Sparring session matched', detail: 'Completed from a matched sparring session · score 82%' })
  assert.equal(evidenceOf(A({ status: 'completed' })), null)
})

test('one primary action per row, by type and group', () => {
  assert.deepEqual(primaryAction(A({ id: 's1', type: 'sparring', target_id: 'p1' })), { kind: 'link', label: 'Start sparring', href: '/sparring/p1?assignmentId=s1', hint: undefined })
  assert.equal((primaryAction(A({ id: 's2', type: 'sparring' })) as any).href, '/sparring/default?assignmentId=s2')
  assert.equal((primaryAction(A({ type: 'call_review', target_id: 'c1' })) as any).label, 'Review call')
  assert.equal((primaryAction(A({ type: 'call_review' })) as any).label, 'Pick a call')
  assert.deepEqual(primaryAction(A({ type: 'custom' })), { kind: 'complete', label: 'Mark complete' })
  assert.deepEqual(primaryAction(A({ type: 'drill' })), { kind: 'complete', label: 'Mark complete' })
  assert.equal((primaryAction(A({ type: 'call_review', target_id: 'c1', status: 'completed' })) as any).label, 'Review result')
  assert.equal(primaryAction(A({ type: 'custom', status: 'completed' })), null)
  assert.equal(primaryAction(A({ type: 'sparring', status: 'cancelled' })), null)
  assert.ok(callReviewHref(A({ id: 'x', target_id: 'c 1' })).startsWith('/calls/c%201?'))
  assert.equal(sparringHref('i', '  '), '/sparring/default?assignmentId=i')
})

test('filters and summary', () => {
  const l = [A({ type: 'sparring', due_at: iso(-1) }), A({ type: 'custom', due_at: iso(0, 1) }), A({ type: 'sparring', due_at: iso(4) }), A({ status: 'completed', completed_at: iso(-2) }), A({ status: 'completed', completed_at: iso(-30) }), A({ status: 'cancelled' })]
  const todo = l.filter((a) => groupOf(a) === 'todo')
  assert.equal(filterTodo(todo, { type: 'sparring' }, NOW).length, 2)
  assert.equal(filterTodo(todo, { due: 'overdue' }, NOW).length, 1)
  assert.equal(filterTodo(todo, { type: 'sparring', due: 'upcoming' }, NOW).length, 1)
  assert.equal(filterTodo(todo, { type: 'all', due: 'all' }, NOW).length, 3)
  assert.deepEqual(summarise(l, NOW), { todo: 3, overdue: 1, dueToday: 1, doneRecent: 1, done: 2 })
  assert.deepEqual(summarise([], NOW), { todo: 0, overdue: 0, dueToday: 0, doneRecent: 0, done: 0 })
})

test('done sorted newest first', () => {
  const l = [A({ id: 'a', status: 'completed', completed_at: iso(-5) }), A({ id: 'b', status: 'completed', completed_at: iso(-1) }), A({ id: 'c', status: 'completed' })]
  assert.deepEqual(sortDone(l).map((x: any) => x.id), ['b', 'a', 'c'])
})
