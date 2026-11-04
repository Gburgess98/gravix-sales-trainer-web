import test from 'node:test'
import assert from 'node:assert/strict'
import { SECTIONS, parseSection, VISIBILITY_OPTIONS, visibilityLabel, validateGamification, gamificationDirty, toGamificationForm, validateThresholds, thresholdsFromConfig, thresholdsDirty, roleGroup, roleCounts, seatsText, summariseVersion } from '../../src/lib/settings-model.ts'

test('sections are the supported set; unknown or missing ids fall back to General', () => {
  assert.deepEqual(SECTIONS.map((s) => s.id), ['general', 'people', 'ai', 'privacy', 'coaching', 'gamification', 'system'])
  assert.equal(parseSection('privacy'), 'privacy')
  assert.equal(parseSection('integrations'), 'general')
  assert.equal(parseSection(null), 'general')
  assert.equal(parseSection('__proto__'), 'general')
})

test('visibility options match the API enum exactly', () => {
  assert.deepEqual(VISIBILITY_OPTIONS.map((o) => o.value), ['everyone', 'managers', 'disabled'])
  assert.equal(visibilityLabel('managers'), 'Managers only')
  assert.equal(visibilityLabel('unknown'), 'Unknown')
})

test('gamification validation mirrors the API (streak int 1–30, multiplier 0.1–10, comeback int 0–5000)', () => {
  const ok = validateGamification({ streak_threshold: '3', xp_multiplier: '1.5', comeback_bonus: '50' })
  assert.deepEqual(ok.values, { streak_threshold: 3, xp_multiplier: 1.5, comeback_bonus: 50 })
  const bad = (f: object) => validateGamification({ streak_threshold: '3', xp_multiplier: '1', comeback_bonus: '0', ...f })
  assert.ok(bad({ streak_threshold: '0' }).errors.streak_threshold)
  assert.ok(bad({ streak_threshold: '31' }).errors.streak_threshold)
  assert.ok(bad({ streak_threshold: '2.5' }).errors.streak_threshold)
  assert.ok(bad({ streak_threshold: '' }).errors.streak_threshold)
  assert.ok(bad({ xp_multiplier: '0.05' }).errors.xp_multiplier)
  assert.ok(bad({ xp_multiplier: '10.1' }).errors.xp_multiplier)
  assert.ok(bad({ xp_multiplier: 'abc' }).errors.xp_multiplier)
  assert.equal(bad({ xp_multiplier: '0.1' }).ok, true)
  assert.equal(bad({ xp_multiplier: '10' }).ok, true)
  assert.ok(bad({ comeback_bonus: '-1' }).errors.comeback_bonus)
  assert.ok(bad({ comeback_bonus: '5001' }).errors.comeback_bonus)
  assert.ok(bad({ comeback_bonus: '1.5' }).errors.comeback_bonus)
  assert.equal(bad({ comeback_bonus: '5000' }).ok, true)
  assert.equal(bad({}).values?.streak_threshold, 3)
  // never leaks an API-style identifier in copy
  for (const m of Object.values(bad({ streak_threshold: 'x', xp_multiplier: 'x', comeback_bonus: 'x' }).errors)) assert.ok(!/_/.test(String(m)))
})

test('gamification dirty compares numbers, not strings ("1" vs "1.0"), and is false without a saved value', () => {
  const saved = toGamificationForm({ streak_threshold: 3, xp_multiplier: 1, comeback_bonus: 0 })
  assert.equal(gamificationDirty(saved, saved), false)
  assert.equal(gamificationDirty({ ...saved, xp_multiplier: '1.0' }, saved), false)
  assert.equal(gamificationDirty({ ...saved, streak_threshold: '4' }, saved), true)
  assert.equal(gamificationDirty({ ...saved, comeback_bonus: '' }, saved), true)
  assert.equal(gamificationDirty(saved, null), false)
})

test('thresholds: ints 0–100 and critical <= low; editable only when the API returned both', () => {
  assert.deepEqual(validateThresholds({ low_score_threshold: '65', critical_score_threshold: '45' }).values, { low_score_threshold: 65, critical_score_threshold: 45 })
  assert.equal(validateThresholds({ low_score_threshold: '50', critical_score_threshold: '50' }).ok, true)
  assert.ok(validateThresholds({ low_score_threshold: '40', critical_score_threshold: '50' }).errors.critical_score_threshold)
  assert.ok(validateThresholds({ low_score_threshold: '101', critical_score_threshold: '5' }).errors.low_score_threshold)
  assert.ok(validateThresholds({ low_score_threshold: '50', critical_score_threshold: '-1' }).errors.critical_score_threshold)
  assert.ok(validateThresholds({ low_score_threshold: '', critical_score_threshold: '1' }).errors.low_score_threshold)
  assert.deepEqual(thresholdsFromConfig({ low_score_threshold: 65, critical_score_threshold: 45 }), { low_score_threshold: '65', critical_score_threshold: '45' })
  assert.equal(thresholdsFromConfig({ low_score_threshold: 65 }), null)
  assert.equal(thresholdsFromConfig({ low_score_threshold: null, critical_score_threshold: null }), null)
  assert.equal(thresholdsFromConfig(undefined), null)
  const s = { low_score_threshold: '65', critical_score_threshold: '45' }
  assert.equal(thresholdsDirty(s, s), false)
  assert.equal(thresholdsDirty({ ...s, low_score_threshold: '70' }, s), true)
  assert.equal(thresholdsDirty(s, null), false)
})

test('people summary groups roles and never needs names or ids', () => {
  assert.equal(roleGroup('Manager'), 'Managers & owners')
  assert.equal(roleGroup('company_manager'), 'Managers & owners')
  assert.equal(roleGroup('SalesRep'), 'Reps')
  assert.equal(roleGroup('rep'), 'Reps')
  assert.equal(roleGroup('TeamLead'), 'Team leads')
  assert.equal(roleGroup(null), 'Other')
  assert.deepEqual(roleCounts([{ role: 'Manager' }, { role: 'SalesRep' }, { role: 'SalesRep' }, { role: 'weird' }, { role: null }]), [
    { label: 'Managers & owners', count: 1 }, { label: 'Reps', count: 2 }, { label: 'Other', count: 2 },
  ])
  assert.deepEqual(roleCounts([]), [])
  assert.equal(seatsText({ allocated: 8, used: 5, available: 3 }), '5 of 8 seats in use')
  assert.equal(seatsText({ allocated: null, used: 5, available: null }), '5 in use · no seat limit found')
  assert.equal(seatsText(null), 'Seat information isn’t available')
})

test('system summary only surfaces the non-secret fields it knows', () => {
  const s = summariseVersion({ ok: true, version: 'abcdef1234567890', buildTime: '2026-11-01T10:00:00Z', app_env: 'staging', scoring: { contract: 'v1', provider: 'openai', side_effects_disabled: false }, transcription_provider: 'assemblyai', sparring: { provider: 'openai' }, secret: 'nope' })
  const labels = s.rows.map((r) => r.label)
  assert.deepEqual(labels, ['API version', 'API built', 'Environment', 'Scoring contract', 'Scoring provider', 'Transcription', 'Sparring buyer'])
  assert.equal(s.rows[0].value, 'abcdef1')
  assert.ok(!JSON.stringify(s).includes('nope'))
  assert.deepEqual(summariseVersion({}).rows, [])
  assert.equal(summariseVersion({ version: 'dev' }).rows[0].value, 'dev build')
  assert.equal(summariseVersion(null).rows.length, 0)
})
