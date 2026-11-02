// Persona library rules (mirrors docs/sparring-arena/PRIVATE_PERSONAS_API.md). UX/testing only: the API must enforce them.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_ACTIVE_PRIVATE,
  applyEdit,
  canArchive,
  canEdit,
  canSee,
  canUse,
  createPrivate,
  duplicate,
  emptyDraft,
  myPersonas,
  parseStore,
  sanitiseText,
  sharedPersonas,
  startPlanFor,
  transition,
  validateDraft,
  type Draft,
  type LibraryPersona,
  type Viewer,
} from '../../src/lib/persona-library.ts'

const rep = (id: string, company = 'c1'): Viewer => ({ id, tier: 'SalesRep', companyId: company })
const mgr = (id: string, company = 'c1'): Viewer => ({ id, tier: 'Manager', companyId: company })
const draft = (over: Partial<Draft> = {}): Draft => ({ ...emptyDraft(), name: 'Dana', jobRole: 'CFO', industry: 'SaaS', objectionStyle: 'numbers_risk', difficulty: 'hard', ...over })
const T = '2026-11-03T10:00:00.000Z'
const make = (owner: Viewer, over: Partial<LibraryPersona> = {}) => ({ ...createPrivate(draft(), owner, `p-${Math.random()}`, T), ...over })

const alice = rep('alice')
const bob = rep('bob')
const boss = mgr('boss')
const otherBoss = mgr('boss2', 'c2')

test('a rep can create a private persona and use it immediately', () => {
  const p = createPrivate(draft(), alice, 'p1', T)
  assert.equal(p.status, 'private')
  assert.ok(canSee(p, alice) && canUse(p, alice) && canEdit(p, alice))
})

test('private personas are invisible to other reps AND to managers (404 semantics), same or other tenant', () => {
  const p = make(alice)
  for (const v of [bob, boss, otherBoss, rep('x', 'c2')]) assert.equal(canSee(p, v), false)
  for (const v of [bob, boss, otherBoss]) assert.equal(canUse(p, v), false)
})

test('submitted: visible to same-tenant managers only, read-only for the owner, usable only by the owner', () => {
  const p = transition(make(alice), 'submit', alice, T)
  assert.ok(p.ok)
  const s = (p as { persona: LibraryPersona }).persona
  assert.equal(s.status, 'submitted')
  assert.ok(canSee(s, alice) && canSee(s, boss))
  assert.equal(canSee(s, otherBoss), false)
  assert.equal(canSee(s, bob), false)
  assert.equal(canEdit(s, alice), false, 'must withdraw before editing')
  assert.equal(canUse(s, boss), false)
  assert.ok(canUse(s, alice))
})

test('approve (same-tenant manager) publishes to the shared library; other tenants and reps cannot approve', () => {
  const s = (transition(make(alice), 'submit', alice, T) as { persona: LibraryPersona }).persona
  assert.deepEqual(transition(s, 'approve', bob, T), { ok: false, error: 'forbidden' })
  assert.deepEqual(transition(s, 'approve', alice, T), { ok: false, error: 'forbidden' })
  assert.deepEqual(transition(s, 'approve', otherBoss, T), { ok: false, error: 'forbidden' })
  const ok = transition(s, 'approve', boss, T) as { ok: true; persona: LibraryPersona }
  assert.equal(ok.persona.status, 'team_approved')
  assert.ok(canUse(ok.persona, bob), 'other reps can use it')
  assert.equal(canUse(ok.persona, rep('z', 'c2')), false, 'other tenants cannot')
})

test('REJECT keeps the rep\'s persona: back to private, still theirs, still usable, not deleted', () => {
  const s = (transition(make(alice), 'submit', alice, T) as { persona: LibraryPersona }).persona
  const r = transition(s, 'reject', boss, T) as { ok: true; persona: LibraryPersona }
  assert.equal(r.persona.status, 'private')
  assert.equal(r.persona.reviewOutcome, 'rejected')
  assert.equal(r.persona.id, s.id)
  assert.ok(canUse(r.persona, alice) && canEdit(r.persona, alice))
  assert.equal(canSee(r.persona, boss), false, 'and managers cannot read it again until resubmitted')
  assert.equal(myPersonas([r.persona], alice).length, 1)
})

test('withdraw returns a submission to private; wrong actors / wrong states are refused', () => {
  const s = (transition(make(alice), 'submit', alice, T) as { persona: LibraryPersona }).persona
  assert.equal((transition(s, 'withdraw', alice, T) as { persona: LibraryPersona }).persona.status, 'private')
  assert.deepEqual(transition(s, 'withdraw', bob, T), { ok: false, error: 'forbidden' })
  assert.deepEqual(transition(make(alice), 'withdraw', alice, T), { ok: false, error: 'invalid_transition' })
  assert.deepEqual(transition(make(alice), 'approve', boss, T), { ok: false, error: 'invalid_transition' })
  assert.deepEqual(transition(s, 'submit', alice, T), { ok: false, error: 'invalid_transition' })
})

test('reps cannot edit team-approved personas; duplicating gives a private, editable copy they own', () => {
  const team = make(boss, { status: 'team_approved' })
  assert.equal(canEdit(team, alice), false)
  assert.equal(applyEdit(team, draft({ name: 'Hacked' }), alice, T), null)
  const copy = duplicate(team, alice, 'copy1', T)!
  assert.equal(copy.status, 'private')
  assert.equal(copy.ownerId, alice.id)
  assert.equal(copy.sourcePersonaId, team.id)
  assert.ok(copy.name.startsWith('Copy of '))
  assert.ok(canEdit(copy, alice))
  assert.equal(team.name, 'Dana', 'the original is untouched')
})

test('duplicate respects visibility: nobody can duplicate a private persona they cannot see', () => {
  assert.equal(duplicate(make(alice), bob, 'x', T), null)
  assert.equal(duplicate(make(alice), boss, 'x', T), null)
})

test('archive: owners archive private; only same-tenant managers archive team personas; restore goes back', () => {
  const p = make(alice)
  const a = transition(p, 'archive', alice, T) as { ok: true; persona: LibraryPersona }
  assert.equal(a.persona.status, 'archived')
  assert.equal(canUse(a.persona, alice), false, 'archived is unavailable for new sessions')
  assert.deepEqual(transition(p, 'archive', bob, T), { ok: false, error: 'forbidden' })
  assert.equal((transition(a.persona, 'restore', alice, T) as { persona: LibraryPersona }).persona.status, 'private')
  const team = make(boss, { status: 'team_approved' })
  assert.equal(canArchive(team, alice), false)
  assert.equal(canArchive(team, boss), true)
  assert.equal(canArchive(team, otherBoss), false)
  assert.deepEqual(transition(a.persona, 'restore', bob, T), { ok: false, error: 'forbidden' })
})

test('lists: shared = team-approved in the tenant only; mine = own non-archived, newest first', () => {
  const mine1 = make(alice, { updatedAt: '2026-11-01T00:00:00Z' })
  const mine2 = make(alice, { updatedAt: '2026-11-02T00:00:00Z' })
  const archived = make(alice, { status: 'archived', archivedFrom: 'private' })
  const submitted = make(bob, { status: 'submitted' })
  const team = make(boss, { status: 'team_approved' })
  const foreignTeam = make(otherBoss, { status: 'team_approved', companyId: 'c2' })
  const all = [mine1, mine2, archived, submitted, team, foreignTeam]
  assert.deepEqual(sharedPersonas(all, alice).map((p) => p.id), [team.id])
  assert.deepEqual(myPersonas(all, alice).map((p) => p.id), [mine2.id, mine1.id])
  assert.equal(myPersonas(all, alice, true).length, 3)
  assert.ok(!sharedPersonas(all, alice).some((p) => p.status !== 'team_approved'), 'no private/submitted in the shared library')
})

test('wizard validation: required fields, length limits, trait cap, per step', () => {
  assert.deepEqual(Object.keys(validateDraft(emptyDraft(), 1)).sort(), ['jobRole', 'name'])
  assert.ok(validateDraft({ ...emptyDraft(), name: 'Dana', jobRole: 'CFO' }, 1).name === undefined)
  assert.ok(validateDraft(emptyDraft(), 2).objectionStyle)
  assert.ok(validateDraft(draft({ traits: ['a', 'b', 'c', 'd', 'e', 'f'] }), 2).traits)
  assert.ok(validateDraft(draft({ context: 'x'.repeat(401) }), 2).context)
  assert.ok(validateDraft(draft({ name: 'x'.repeat(61) }), 1).name)
  assert.deepEqual(validateDraft(draft(), 4), {})
})

test('free text is sanitised (control characters stripped, whitespace collapsed) before it can reach a prompt', () => {
  assert.equal(sanitiseText('  Dana\u0000\n\n  the\tCFO  '), 'Dana the CFO')
  const p = createPrivate(draft({ name: 'A\u0007\nB', context: 'line1\r\nline2' }), alice, 'p', T)
  assert.equal(p.name, 'A B')
  assert.equal(p.context, 'line1 line2')
})

test('objection style derives the real engine; the client cannot choose a base engine directly', () => {
  const plan = startPlanFor(createPrivate(draft({ objectionStyle: 'hostile', difficulty: 'nightmare', lengthPref: 'quick' }), alice, 'p', T))
  assert.deepEqual(plan, { personaId: 'angry', difficulty: 'nightmare', mode: 'close_2m' })
  assert.equal(startPlanFor(createPrivate(draft({ objectionStyle: 'process', lengthPref: 'long' }), alice, 'p', T)).personaId, 'procurement')
})

test('editing keeps identity and creation time; stranger cannot edit', () => {
  const p = make(alice, { createdAt: '2026-01-01T00:00:00Z' })
  const e = applyEdit(p, draft({ name: 'Renamed' }), alice, T)!
  assert.deepEqual([e.id, e.name, e.createdAt, e.updatedAt], [p.id, 'Renamed', '2026-01-01T00:00:00Z', T])
  assert.equal(applyEdit(p, draft({ name: 'Nope' }), bob, T), null)
})

test('local store ignores corrupt JSON and other users\' records', () => {
  const mine = make(alice)
  const theirs = make(bob)
  assert.deepEqual(parseStore(null, 'alice'), [])
  assert.deepEqual(parseStore('{not json', 'alice'), [])
  assert.deepEqual(parseStore('{"a":1}', 'alice'), [])
  assert.deepEqual(parseStore(JSON.stringify([mine, theirs, { id: 1 }]), 'alice').map((p) => p.id), [mine.id])
})

test('active private limit constant matches the API proposal', () => {
  assert.equal(MAX_ACTIVE_PRIVATE, 20)
})
