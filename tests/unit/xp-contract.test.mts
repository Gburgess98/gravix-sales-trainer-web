import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { xpFromResponse, xpPath } from '../../src/lib/progress-model.ts'

/* One points contract for every screen: GET /v1/reps/:id/xp -> { ok, repId, total_xp, last_event_at, warning? }. */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const code = (f: string) => readFileSync(join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('real response: total_xp is mapped, today is never invented', () => {
  assert.deepEqual(xpFromResponse({ ok: true, repId: 'r', total_xp: 1240, last_event_at: '2026-11-05T10:00:00.000Z' }), { total: 1240, today: null })
  assert.deepEqual(xpFromResponse({ ok: true, total_xp: 0, last_event_at: null }), { total: 0, today: null }) // a genuine zero is zero
  assert.deepEqual(xpFromResponse({ ok: true, total_xp: -5 }), { total: -5, today: null })
})

test('warning fallback is unavailable, not zero', () => {
  assert.equal(xpFromResponse({ ok: true, repId: 'r', total_xp: 0, last_event_at: null, warning: 'relation "xp_events" does not exist' }), null)
})

test('anything that is not a finite total is unavailable', () => {
  for (const bad of [null, undefined, 42, 'x', [], {}, { ok: false, total_xp: 10 }, { ok: true }, { ok: true, total_xp: '10' }, { ok: true, total_xp: NaN }, { ok: true, total_xp: Infinity }, { ok: true, total_xp: null }]) {
    assert.equal(xpFromResponse(bad), null, JSON.stringify(bad))
  }
})

test('request path is /v1/reps/:id/xp, id encoded; never the non-existent /v1/assignments/me', () => {
  assert.equal(xpPath('11111111-2222-4333-8444-555555555555'), '/v1/reps/11111111-2222-4333-8444-555555555555/xp')
  assert.equal(xpPath('a b/c'), '/v1/reps/a%20b%2Fc/xp')
  assert.ok(!xpPath('x').includes('assignments'))
})

test('Progress uses the shared helpers (cannot drift) and does not parse points itself', () => {
  const src = code('src/app/progress/page.tsx')
  assert.match(src, /xpFromResponse\(x\)/)
  assert.match(src, /getJson\(xpPath\(repId\)\)/)
  assert.doesNotMatch(src, /total_xp|assignments\/me|xp_today|xp_total/)
})

test('Home (/dashboard) reads no points: identity only, and no stale xp_* fields remain on the shared RepMe type', () => {
  const home = code('src/app/dashboard/page.tsx')
  assert.doesNotMatch(home, /xp_total|xp_today|total_xp|assignments\/me|\.xp\b/)
  const model = code('src/lib/progress-model.ts')
  assert.doesNotMatch(model.slice(model.indexOf('export type RepMe'), model.indexOf('export type Assignment ')), /xp_/)
})

test('no source file reads points from /v1/assignments/me', () => {
  for (const f of ['src/app/progress/page.tsx', 'src/app/dashboard/page.tsx', 'src/components/rep/progress-view.tsx', 'src/lib/progress-model.ts', 'src/components/rep/my-assignments-panel.tsx']) {
    assert.doesNotMatch(code(f), /assignments\/me/, f)
  }
})
