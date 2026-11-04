import test from 'node:test'
import assert from 'node:assert/strict'
import { friendlyError, statusOf } from '../../src/lib/friendly-error.ts'

const FB = 'Couldn’t load this right now.'
const LEAKS = [/missing_user/i, /x-org-id/i, /HTTP \d/, /Cannot read properties/i, /_failed/, /relation "/, /TypeError/, /ECONNREFUSED/i]

test('raw backend and runtime text is never returned', () => {
  const inputs: unknown[] = [
    new Error('missing_user'), new Error('Missing or invalid x-org-id'), new Error('HTTP 500'), new Error("Cannot read properties of undefined (reading 'display_name')"),
    'pipeline_fetch_failed', 'stage_update_failed_500', { error: 'relation "org_settings" does not exist' }, new TypeError('fetch failed: ECONNREFUSED 127.0.0.1:3000'), { message: 'tasks_fetch_failed' }, undefined, null, 42,
  ]
  for (const i of inputs) {
    const out = friendlyError(i, FB)
    for (const re of LEAKS) assert.doesNotMatch(out, re, `leaked from ${String(i)}: ${out}`)
  }
})

test('maps the failure type to calm copy; everything else is the caller’s fallback', () => {
  assert.match(friendlyError(new Error('missing_user'), FB), /session has expired/)
  assert.match(friendlyError({ status: 401 }, FB), /session has expired/)
  assert.match(friendlyError(new Error('forbidden_not_manager'), FB), /don’t have access/)
  assert.match(friendlyError({ status: 403 }, FB), /don’t have access/)
  assert.match(friendlyError(new Error('Failed to load notes (404)'), FB), /couldn’t find/)
  assert.match(friendlyError({ status: 429 }, FB), /Too many/)
  assert.match(friendlyError(new TypeError('Failed to fetch'), FB), /Can’t reach the server/)
  assert.equal(friendlyError(new Error('HTTP 500'), FB), FB)
  assert.equal(friendlyError(new Error('Missing or invalid x-org-id'), FB), FB)
  assert.equal(friendlyError(undefined, FB), FB)
})

test('statusOf reads a status field or a status in the text', () => {
  assert.equal(statusOf({ status: 403 }), 403)
  assert.equal(statusOf(new Error('Failed to save note (500)')), 500)
  assert.equal(statusOf(new Error('nothing here')), null)
  assert.equal(statusOf('HTTP 404'), 404)
})
