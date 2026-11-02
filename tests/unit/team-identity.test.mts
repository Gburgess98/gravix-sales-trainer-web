import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { memberLabel, memberInitials, resolveRepName, looksLikeUuid, NEUTRAL_MEMBER_LABEL } from '../../src/lib/team-identity.ts'

const ID = '278be53c-0528-4b67-b114-a4e815ba8be6'
const roster = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Alex Johnson', email: 'alex@example.test' },
  { id: ID, name: 'Priya Nair', email: 'priya.nair@example.test' },
  { id: '22222222-2222-4222-8222-222222222222', name: '', email: 'sam.rivera@example.test' },
  { id: '33333333-3333-4333-8333-333333333333', name: '33333333-3333-4333-8333-333333333333', email: null },
]

test('roster name is resolved from the matching route UUID (case-insensitive)', () => {
  assert.equal(resolveRepName(roster, ID), 'Priya Nair')
  assert.equal(resolveRepName(roster, ID.toUpperCase()), 'Priya Nair')
})

test('missing/blank name falls back to the email local part', () => {
  assert.equal(resolveRepName(roster, '22222222-2222-4222-8222-222222222222'), 'sam.rivera')
  assert.equal(memberLabel({ name: 'dana@example.test', email: null }), 'dana')
})

test('unmatched UUID, empty roster and missing data use "Team member"', () => {
  assert.equal(resolveRepName(roster, '99999999-9999-4999-8999-999999999999'), NEUTRAL_MEMBER_LABEL)
  assert.equal(resolveRepName([], ID), NEUTRAL_MEMBER_LABEL)
  assert.equal(resolveRepName(null, ID), NEUTRAL_MEMBER_LABEL)
  assert.equal(resolveRepName(roster, undefined), NEUTRAL_MEMBER_LABEL)
})

test('a UUID is never returned as a display name, from any field', () => {
  assert.equal(resolveRepName(roster, '33333333-3333-4333-8333-333333333333'), NEUTRAL_MEMBER_LABEL)
  assert.equal(memberLabel({ name: ID, email: `${ID}@example.test` }), NEUTRAL_MEMBER_LABEL)
  for (const m of roster) assert.equal(looksLikeUuid(memberLabel(m)), false)
  assert.equal(looksLikeUuid(resolveRepName(roster, ID)), false)
  assert.equal(memberInitials({ name: null, email: null }), 'TM')
})

test('rep detail page: heading is roster-resolved, id stays internal, back link is Team', () => {
  const src = readFileSync(new URL('../../src/app/crm/reps/[id]/page.tsx', import.meta.url), 'utf8')
  assert.ok(src.includes('resolveRepName('), 'uses the shared resolver')
  assert.ok(src.includes('/v1/team/members'), 'reads the existing roster endpoint')
  assert.ok(!/\{\s*data\?\.userId\s*\?\?\s*repId/.test(src), 'heading must not fall back to ids')
  assert.ok(src.includes('href="/team"') && src.includes('← Team') && !src.includes('← CRM'))
  assert.ok(src.includes('aria-busy={repName === null}'), 'skeleton while identity loads')
  // no display name travels through the URL
  assert.ok(!/[?&](name|repName|displayName)=/.test(src))
})
