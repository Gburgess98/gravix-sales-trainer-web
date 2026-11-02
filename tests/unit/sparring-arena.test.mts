// Pure model for the Sparring Arena: carousel loop maths, honest stat derivation, start-request contract.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PASS_SCORE,
  buildStartBody,
  challengeLines,
  isManagerTier,
  loopOffset,
  normaliseDifficulty,
  personalBest,
  presentationFor,
  stepIndex,
  summariseLeaderboard,
  teamRecord,
} from '../../src/lib/sparring-arena.ts'

test('loopOffset: shortest signed distance on a loop (5 items)', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => loopOffset(i, 0, 5)), [0, 1, 2, -2, -1])
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => loopOffset(i, 4, 5)), [1, 2, -2, -1, 0])
})

test('loopOffset: the selected item is always 0 and neighbours are +/-1, for every active index', () => {
  for (const n of [3, 4, 5, 6, 7]) {
    for (let a = 0; a < n; a++) {
      assert.equal(loopOffset(a, a, n), 0)
      assert.equal(loopOffset((a + 1) % n, a, n), 1)
      assert.equal(loopOffset((a - 1 + n) % n, a, n), -1)
    }
  }
})

test('stepIndex loops in both directions and tolerates large deltas', () => {
  assert.equal(stepIndex(4, 1, 5), 0)
  assert.equal(stepIndex(0, -1, 5), 4)
  assert.equal(stepIndex(2, 12, 5), 4)
  assert.equal(stepIndex(0, -13, 5), 2)
  assert.equal(stepIndex(0, 1, 0), 0)
})

test('normaliseDifficulty falls back to normal', () => {
  assert.equal(normaliseDifficulty('HARD'), 'hard')
  assert.equal(normaliseDifficulty('nightmare'), 'nightmare')
  assert.equal(normaliseDifficulty(null), 'normal')
  assert.equal(normaliseDifficulty('wat'), 'normal')
})

const S = (rep: string, persona: string, total: number | null) => ({ id: `${rep}-${persona}-${total}`, rep_id: rep, persona_id: persona, total })

test('personalBest only counts the caller\'s own sessions for that persona', () => {
  const sessions = [S('me', 'cfo', 71), S('me', 'cfo', 88), S('me', 'angry', 95), S('them', 'cfo', 99), S('me', 'cfo', null)]
  assert.deepEqual(personalBest(sessions, 'me', 'cfo'), { best: 88, attempts: 3, defeated: 1 })
  assert.deepEqual(personalBest(sessions, 'me', 'silent'), { best: null, attempts: 0, defeated: 0 })
  assert.deepEqual(personalBest(sessions, null, 'cfo'), { best: null, attempts: 0, defeated: 0 })
})

test('teamRecord is UNAVAILABLE for reps (API only returns their own sessions) and derived for managers', () => {
  const sessions = [S('a', 'cfo', 71), S('b', 'cfo', 93), S('b', 'angry', 99)]
  const rep = teamRecord(sessions, 'cfo', false)
  assert.equal(rep.value, null)
  assert.equal(rep.provenance, 'unavailable')
  const mgr = teamRecord(sessions, 'cfo', true)
  assert.deepEqual([mgr.value, mgr.provenance], [93, 'derived'])
  assert.equal(teamRecord(sessions, 'silent', true).value, null)
})

test('summariseLeaderboard keeps the API numbers and labels scope by role; failure is unavailable', () => {
  const lb = { ok: true, wins: 9, losses: 28, total: 37 }
  const m = summariseLeaderboard(lb, true)
  assert.deepEqual([m.scope, m.attempts.value, m.defeated.value, m.attempts.provenance], ['team', 37, 9, 'real'])
  assert.equal(summariseLeaderboard(lb, false).scope, 'you')
  const bad = summariseLeaderboard({ ok: false }, true)
  assert.deepEqual([bad.attempts.value, bad.attempts.provenance], [null, 'unavailable'])
  assert.equal(summariseLeaderboard(null, false).defeated.provenance, 'unavailable')
})

test('challengeLines never fabricates: empty data yields no lines; rep wording is personal, not "team"', () => {
  const none = challengeLines({
    isManager: false,
    record: { value: null, provenance: 'unavailable' },
    yourBest: null,
    leaderboard: summariseLeaderboard(null, false),
  })
  assert.deepEqual(none, [])
  const rep = challengeLines({
    isManager: false,
    record: { value: null, provenance: 'unavailable' },
    yourBest: 82,
    leaderboard: summariseLeaderboard({ ok: true, wins: 2, total: 5 }, false),
  })
  assert.ok(rep.every((l) => !/team/i.test(l)), rep.join(' | '))
  assert.ok(rep.includes('Your best: 82/100'))
  const mgr = challengeLines({
    isManager: true,
    record: { value: 93, provenance: 'derived' },
    yourBest: null,
    leaderboard: summariseLeaderboard({ ok: true, wins: 9, total: 37 }, true),
  })
  assert.ok(mgr[0].startsWith('Team record: 93/100'))
  assert.ok(mgr.some((l) => l.includes('37 attempts by your team') && l.includes('9 defeated')))
})

test('buildStartBody reproduces the SparringStartButton contract exactly', () => {
  assert.deepEqual(buildStartBody({ personaId: 'cfo', difficulty: 'hard', mode: 'standard' }), {
    personaId: 'cfo',
    difficulty: 'hard',
    meta: { opponent_profile: { jobTitle: null, industry: null, companySize: null } },
    mode: 'standard',
  })
  const trial = buildStartBody({ personaId: 'cfo', difficulty: 'hard', mode: 'time_trial' })
  assert.equal(trial.mode, 'time_trial')
  assert.equal('targetDurationSec' in trial, false)
  const close = buildStartBody({ personaId: 'cfo', difficulty: 'hard', mode: 'close_2m' })
  assert.equal(close.mode, 'time_trial')
  assert.equal(close.targetDurationSec, 120)
  assert.equal(buildStartBody({ personaId: 'x', difficulty: 'normal', mode: 'standard', assignmentId: 'a1' }).assignmentId, 'a1')
  assert.equal('assignmentId' in buildStartBody({ personaId: 'x', difficulty: 'normal', mode: 'standard' }), false)
})

test('manager tiers and pass score match the API definitions', () => {
  assert.equal(PASS_SCORE, 80)
  assert.ok(['Manager', 'Owner', 'PartnerAdmin', 'SuperAdmin'].every(isManagerTier))
  assert.equal(isManagerTier('SalesRep'), false)
  assert.equal(isManagerTier(undefined), false)
})

test('presentationFor: every API persona has copy; unknown ids degrade to the API fields', () => {
  for (const id of ['price_sensitive', 'angry', 'silent', 'cfo', 'procurement'])
    assert.ok(presentationFor({ id, label: id }).role.length > 0)
  const p = presentationFor({ id: 'new_one', label: 'New', traits: ['A', 'B', 'C'], description: 'desc' })
  assert.deepEqual([p.role, p.context, p.objectionStyle, p.objective], ['Prospect', 'A · B', 'A', 'desc'])
})

// ── Static guards for the carousel's motion rules (UX brief: never auto-rotate, honour reduced motion, GPU-only) ──
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8')

test('arena code never auto-advances (no setInterval / autoplay / rAF loop)', () => {
  const files = [
    ...readdirSync(path.join(ROOT, 'src/components/arena')).filter((f) => f.endsWith('.tsx')).map((f) => `src/components/arena/${f}`),
    'src/app/sparring/ArenaClient.tsx',
  ]
  for (const f of files) assert.ok(!/setInterval|autoplay|autoPlay|requestAnimationFrame/.test(read(f)), `${f} schedules motion`)
})

test('arena.module.css honours prefers-reduced-motion and only animates transform/opacity', () => {
  const css = read('src/components/arena/arena.module.css')
  const reduced = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/)
  assert.ok(reduced, 'missing reduced-motion block')
  assert.match(reduced![1], /\.card\s*\{\s*transition:\s*none/)
  assert.match(reduced![1], /\.float\s*\{\s*animation:\s*none/)
  assert.ok(!/transition:\s*all/.test(css), 'transition: all is not GPU-friendly')
  const transitions = [...css.matchAll(/transition:\s*([\s\S]*?);/g)].map((m) => m[1]).filter((t) => t !== 'none')
  for (const t of transitions) assert.ok(/^\s*transform[\s\S]*opacity/.test(t) || /^(transform|opacity)/.test(t.trim()), `unexpected transition: ${t}`)
})
