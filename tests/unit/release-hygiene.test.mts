import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

test('diagnostic and stray files are gone (and stay gone)', () => {
  for (const p of ['src/pages', 'src/app/page', 'src/login', 'src/app/api/env', 'src/app/dev/audio-test', 'src/app/crm/import/ContactsImportClient.tsx']) {
    assert.equal(existsSync(join(ROOT, p)), false, `${p} should not exist`)
  }
})

test('dev pages 404 in production unless ENABLE_DEV_ROUTES=1', () => {
  const s = read('src/app/dev/layout.tsx')
  assert.match(s, /process\.env\.NODE_ENV === 'production' && process\.env\.ENABLE_DEV_ROUTES !== '1'\) notFound\(\)/)
})

test('/health is a super-admin diagnostic', () => {
  assert.match(read('src/app/health/layout.tsx'), /<RoleGate level="super">/)
})

test('no link points at a route that does not exist', () => {
  assert.ok(!read('src/components/HomeLanding.tsx').includes('/proxy/health'), 'HomeLanding links the 404 /proxy/health')
  const overview = read('src/app/crm/overview/page.tsx')
  assert.ok(!/href=\{`\/assignments\/\$\{/.test(overview), '/assignments/${id} has no route')
  assert.ok(!overview.includes('/crm/contacts/import'), 'overview should link the real importer')
  assert.ok(overview.includes('href="/crm/import"'))
})

test('the old contact-import placeholder only redirects to the real importer', () => {
  const s = read('src/app/crm/contacts/import/page.tsx')
  assert.match(s, /redirect\("\/crm\/import"\)/)
  assert.ok(!/Route fixed/.test(s))
})

test('compatibility redirects that real links still use are kept', () => {
  assert.ok(existsSync(join(ROOT, 'src/app/recent-calls/page.tsx')), 'OAuth callback and HomeLanding still use /recent-calls')
  assert.ok(existsSync(join(ROOT, 'src/app/crm/manager/control-centre/page.tsx')), 'Manager Centre and CRM overview still link it')
})
