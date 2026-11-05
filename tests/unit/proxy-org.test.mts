import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveProxyOrgId } from '../../src/lib/proxyOrg.ts'

const ORG_A = '00000000-2711-4000-8000-000000000002'
const ORG_B = '99999999-9999-4999-8999-999999999999'
const FALLBACK = '11111111-1111-4111-8111-111111111111'
const base = { isProd: true, clientOrgId: '', verifiedOrgId: '', fallbackOrgId: '', allowDefaultInProd: false }

test('verified membership wins and is what is forwarded', () => {
  assert.deepEqual(resolveProxyOrgId({ ...base, verifiedOrgId: ORG_A }), { ok: true, orgId: ORG_A, source: 'membership' })
  // verified membership beats the configured default, in every environment
  assert.equal((resolveProxyOrgId({ ...base, verifiedOrgId: ORG_A, fallbackOrgId: FALLBACK, allowDefaultInProd: true }) as any).orgId, ORG_A)
  assert.equal((resolveProxyOrgId({ ...base, isProd: false, verifiedOrgId: ORG_A, fallbackOrgId: FALLBACK }) as any).orgId, ORG_A)
})

test('a client-supplied org that differs from the verified org is refused, never forwarded or corrected', () => {
  for (const isProd of [true, false]) {
    assert.deepEqual(resolveProxyOrgId({ ...base, isProd, verifiedOrgId: ORG_A, clientOrgId: ORG_B }), { ok: false, error: 'org_mismatch', status: 403 })
    assert.equal(resolveProxyOrgId({ ...base, isProd, verifiedOrgId: ORG_A, clientOrgId: 'not-a-uuid' }).ok, false)
    assert.equal(resolveProxyOrgId({ ...base, isProd, verifiedOrgId: ORG_A, clientOrgId: '00000000-0000-0000-0000-000000000000' }).ok, false, 'the zero-UUID bypass value is a mismatch too')
  }
})

test('a client org equal to the verified org (any case, padded) is fine', () => {
  assert.equal(resolveProxyOrgId({ ...base, verifiedOrgId: ORG_A, clientOrgId: ` ${ORG_A.toUpperCase()} ` }).ok, true)
})

test('without verified membership a client org is IGNORED (cannot be verified)', () => {
  const d = resolveProxyOrgId({ ...base, clientOrgId: ORG_B })
  assert.deepEqual(d, { ok: true, orgId: '', source: 'none' })
  const dev = resolveProxyOrgId({ ...base, isProd: false, clientOrgId: ORG_B })
  assert.deepEqual(dev, { ok: true, orgId: '', source: 'none' })
})

test('the default org is an explicit last resort: dev always, production only when opted in', () => {
  assert.deepEqual(resolveProxyOrgId({ ...base, isProd: false, fallbackOrgId: FALLBACK }), { ok: true, orgId: FALLBACK, source: 'fallback' })
  assert.deepEqual(resolveProxyOrgId({ ...base, fallbackOrgId: FALLBACK }), { ok: true, orgId: '', source: 'none' })
  assert.deepEqual(resolveProxyOrgId({ ...base, fallbackOrgId: FALLBACK, allowDefaultInProd: true }), { ok: true, orgId: FALLBACK, source: 'fallback' })
  // a client org never "upgrades" the fallback
  assert.equal((resolveProxyOrgId({ ...base, isProd: false, clientOrgId: ORG_B, fallbackOrgId: FALLBACK }) as any).orgId, FALLBACK)
})

test('nothing available → no org header (the API decides); never invents one', () => {
  assert.deepEqual(resolveProxyOrgId(base), { ok: true, orgId: '', source: 'none' })
  assert.deepEqual(resolveProxyOrgId({ ...base, isProd: false }), { ok: true, orgId: '', source: 'none' })
})

test('the module carries no UUID predicate of its own (the API’s strict check stays the single authority)', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'lib', 'proxyOrg.ts'), 'utf8').replace(/\/\/.*$/gm, '')
  assert.ok(!/\[0-9a-f\]\{8\}/i.test(src), 'no uuid regex')
  assert.ok(!/\[89ab\]/i.test(src), 'no variant-nibble check')
})
