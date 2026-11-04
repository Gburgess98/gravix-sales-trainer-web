import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { navigation } from '../../src/config/navigation.ts'

/* Route-guard coverage. Role-restricted destinations must be guarded by a `RoleGate` in a segment `layout.tsx`
   (src/components/auth/role-gate.tsx), so a page added to a guarded folder is protected by default. This reads the
   file tree, so it fails if a restricted route (or a restricted nav entry) is not under a guarded segment. */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const APP = join(ROOT, 'src', 'app')
const RANK = { manager: 1, partner: 2, super: 3 } as const
type Level = keyof typeof RANK

/** Strongest RoleGate level declared in a layout.tsx on the path from `app` to the route's folder (null = unguarded). */
export function guardLevel(route: string, appDir: string = APP): Level | null {
  const segs = route.split('?')[0].split('/').filter(Boolean)
  let best: Level | null = null
  for (let i = 0; i <= segs.length; i++) {
    const layout = join(appDir, ...segs.slice(0, i), 'layout.tsx')
    if (!existsSync(layout)) continue
    const m = readFileSync(layout, 'utf8').match(/<RoleGate\s+level="(manager|partner|super)"/)
    if (m && (!best || RANK[m[1] as Level] > RANK[best])) best = m[1] as Level
  }
  return best
}
const ok = (level: Level | null, need: Level) => level !== null && RANK[level] >= RANK[need]

test('non-vacuous: the resolver sees guarded folders and rejects unguarded ones (and weaker levels)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'guards-'))
  try {
    mkdirSync(join(tmp, 'a', 'b'), { recursive: true })
    mkdirSync(join(tmp, 'open'), { recursive: true })
    mkdirSync(join(tmp, 'a', 'c'), { recursive: true })
    writeFileSync(join(tmp, 'a', 'layout.tsx'), `export default function L({children}){return <RoleGate level="manager">{children}</RoleGate>}`)
    writeFileSync(join(tmp, 'a', 'c', 'layout.tsx'), `export default function L({children}){return <RoleGate level="super">{children}</RoleGate>}`)
    writeFileSync(join(tmp, 'open', 'layout.tsx'), `export default function L({children}){return <div>{children}</div>}`)
    assert.equal(guardLevel('/a/b', tmp), 'manager') // inherited from the parent segment
    assert.equal(guardLevel('/a/c/x', tmp), 'super') // strongest on the path
    assert.equal(guardLevel('/open', tmp), null) // a layout without a RoleGate is not a guard
    assert.equal(guardLevel('/nowhere', tmp), null)
    assert.equal(ok(guardLevel('/a/b', tmp), 'partner'), false)
  } finally { rmSync(tmp, { recursive: true, force: true }) }
})

test('every restricted navigation entry sits under a guard of at least its level', () => {
  const need = (roles?: string[]): Level | null => (!roles ? null : roles.includes('superadmin') ? 'super' : roles.includes('partneradmin') ? 'partner' : roles.includes('manager') ? 'manager' : null)
  const restricted = navigation.flatMap((s) => s.items.map((i) => ({ ...i, roles: i.roles ?? s.roles }))).filter((i) => need(i.roles))
  assert.ok(restricted.length >= 10, 'expected the manager/admin nav entries')
  for (const i of restricted) {
    const lvl = need(i.roles)!
    assert.ok(ok(guardLevel(i.href), lvl), `${i.label} (${i.href}) needs a ${lvl} guard, found ${guardLevel(i.href)}`)
  }
})

test('every known manager/admin route is guarded (not just the ones in the nav)', () => {
  const managerRoutes = ['/coaching', '/team', '/intelligence', '/admin/settings', '/admin/personas', '/admin/reps', '/admin/assignments', '/admin/assignments/create', '/admin/assignments/queue', '/crm/analytics', '/crm/manager', '/crm/manager/contacts', '/crm/manager/nudges', '/crm/reps/x', '/crm/overview', '/crm/import', '/crm/contacts/import']
  const partnerRoutes = ['/admin/users', '/admin/users/x', '/admin/companies', '/admin/companies/x']
  const superRoutes = ['/admin/partners', '/admin/score', '/admin/status', '/health']
  for (const r of managerRoutes) assert.ok(ok(guardLevel(r), 'manager'), `${r} is not guarded`)
  for (const r of partnerRoutes) assert.ok(ok(guardLevel(r), 'partner'), `${r} needs a partner guard`)
  for (const r of superRoutes) assert.ok(ok(guardLevel(r), 'super'), `${r} needs a super guard`)
})

test('shared / rep routes are NOT guarded (no over-blocking)', () => {
  for (const r of ['/dashboard', '/assignments', '/progress', '/call-library', '/calls/x', '/upload', '/crm/accounts', '/crm/accounts/x', '/crm/contacts/x', '/crm/pipeline', '/crm/tasks', '/settings/profile', '/sparring', '/sparring/x', '/whisperer', '/login']) {
    assert.equal(guardLevel(r), null, `${r} should stay open to every signed-in user`)
  }
})

test('probes are the API endpoints that already answer 200/403 by role, and failures never render the page', () => {
  const src = readFileSync(join(ROOT, 'src', 'components', 'auth', 'role-gate.tsx'), 'utf8')
  assert.match(src, /manager: '\/v1\/admin\/config'/)
  assert.match(src, /partner: '\/v1\/admin\/partner\/health'/)
  assert.match(src, /super: '\/v1\/admin\/super\/health'/)
  assert.match(src, /res\.status === 401 \|\| res\.status === 403\) return router\.replace\(redirectTo\)/)
  assert.match(src, /if \(state === 'allowed'\) return <>\{children\}<\/>/)
  assert.ok(!/localStorage/.test(src))
})

test('no page re-implements its own role gate (one mechanism)', () => {
  const stray = ['coaching/page.tsx', 'crm/manager/page.tsx', 'admin/settings/page.tsx'].filter((f) => /ManagerGate|RoleGate/.test(readFileSync(join(APP, f), 'utf8').replace(/\/\/.*$/gm, '')))
  assert.deepEqual(stray, [])
})
