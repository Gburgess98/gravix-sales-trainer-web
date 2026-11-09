import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/* /progress points contract. The live endpoint is GET /v1/reps/:id/xp -> { ok, repId, total_xp: number, last_event_at: ISO|null, warning? }
   (API src/routes/reps.ts). /v1/assignments/me does not exist on the live API (its handler sits in an unmounted router) and
   /v1/reps/me returns identity only, so neither can supply points. No points-today figure exists, so none may be shown. */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const code = (f: string) => readFileSync(join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('the page requests /v1/reps/<self>/xp through proxyFetch and never /v1/assignments/me', () => {
  const src = code('src/app/progress/page.tsx')
  assert.match(src, /getJson\(xpPath\(repId\)\)/)
  assert.doesNotMatch(src, /assignments\/me/)
  assert.match(src, /proxyFetch\(path/)
  assert.doesNotMatch(src, /(?<![A-Za-z0-9_$.])fetch\(/)
})

test('points are parsed by the shared helper only (no per-page field mapping, no invented xp_today / xp_total / rep.*)', () => {
  const src = code('src/app/progress/page.tsx')
  assert.match(src, /xpFromResponse\(x\)/)
  assert.doesNotMatch(src, /total_xp|xp_today|xp_total|x\.rep\b/)
})

test('the view shows a points-today line only for a real number', () => {
  const v = code('src/components/rep/progress-view.tsx')
  assert.match(v, /typeof p\.xp\.data\.today === 'number' && p\.xp\.data\.today > 0/)
})
