// Focused unit tests for the role-based navigation model (no browser, no Next).
// Run: npm test   (node:test; imports the real config/model modules).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { navigation, isShellPath } from '../../src/config/navigation.ts'
import {
  buildNavModel,
  hasAccess,
  isNavItemActive,
  collectNavHrefs,
  resolveNavItem,
} from '../../src/config/nav-model.ts'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const HREFS = collectNavHrefs(navigation)

const PERSONAS = [
  { name: 'rep', isManager: false, tier: undefined },
  { name: 'manager', isManager: true, tier: undefined },
  { name: 'partneradmin (non-manager)', isManager: false, tier: 'PartnerAdmin' },
  { name: 'superadmin', isManager: true, tier: 'SuperAdmin' },
] as const

const keys = (items: { label: string; href: string }[]) => items.map((i) => `${i.label}|${i.href}`)
const primary = (isManager: boolean, tier?: string) =>
  keys(buildNavModel(navigation, isManager, tier).sections.flatMap((s) => s.items))
const all = (isManager: boolean, tier?: string) => {
  const m = buildNavModel(navigation, isManager, tier)
  return [...m.sections.flatMap((s) => s.items), ...m.more]
}

test('rep primary nav is Home, Calls, Practice, Coaching (+ Upload Call utility)', () => {
  assert.deepEqual(primary(false), [
    'Home|/dashboard',
    'Calls|/call-library',
    'Practice|/call-library?tab=sparring',
    'Coaching|/assignments',
    'Progress|/progress',
    'Upload Call|/upload',
  ])
})

test('manager primary nav is Overview, Team, Reviews, Assignments, Insights (+ Upload Call)', () => {
  assert.deepEqual(primary(true), [
    'Overview|/coaching',
    'Team|/team',
    'Reviews|/coaching?tab=review',
    'Assignments|/coaching?tab=assignments',
    'Insights|/crm/analytics',
    'Upload Call|/upload',
  ])
})

test('manager sees Calls and Practice under More, not primary', () => {
  const m = buildNavModel(navigation, true)
  const more = keys(m.more)
  assert.ok(more.includes('Calls|/call-library'))
  assert.ok(more.includes('Practice|/call-library?tab=sparring'))
  assert.ok(more.includes('My Dashboard|/dashboard'), 'rep dashboard stays reachable for managers')
  assert.ok(more.includes('My Assignments|/assignments'), 'own assignment queue stays reachable for managers')
  assert.ok(more.includes('My Progress|/progress'), 'own progress stays reachable for managers')
})

test('never more than five destinations plus Upload Call, for any persona', () => {
  for (const p of PERSONAS) {
    const n = primary(p.isManager, p.tier).filter((k) => !k.endsWith('|/upload')).length
    assert.ok(n <= 5, `${p.name} has ${n}`)
  }
})

test('rep and partneradmin-non-manager never see manager-only destinations', () => {
  const managerOnly = ['/team', '/coaching?tab=review', '/coaching?tab=assignments', '/crm/analytics', '/crm/manager', '/crm/manager/contacts', '/intelligence', '/admin/settings']
  for (const p of [PERSONAS[0], PERSONAS[2]]) {
    const hrefs = all(p.isManager, p.tier).map((i) => i.href)
    for (const h of managerOnly) assert.ok(!hrefs.includes(h), `${p.name} sees ${h}`)
  }
})

test('control plane: partners need SuperAdmin; companies/users need PartnerAdmin+', () => {
  const hrefs = (isM: boolean, t?: string) => all(isM, t).map((i) => i.href)
  assert.ok(!hrefs(true).includes('/admin/partners') && !hrefs(true).includes('/admin/companies'))
  assert.ok(hrefs(false, 'PartnerAdmin').includes('/admin/companies'))
  assert.ok(!hrefs(false, 'PartnerAdmin').includes('/admin/partners'))
  assert.ok(hrefs(true, 'SuperAdmin').includes('/admin/partners'))
})

test('no duplicate hrefs or labels within any persona', () => {
  for (const p of PERSONAS) {
    const items = all(p.isManager, p.tier)
    assert.equal(new Set(items.map((i) => i.href)).size, items.length, `${p.name} dup href`)
    assert.equal(new Set(items.map((i) => i.label)).size, items.length, `${p.name} dup label`)
  }
})

test('manager override changes wording/placement only, never visibility', () => {
  const calls = navigation.flatMap((s) => s.items).find((i) => i.href === '/call-library')!
  assert.equal(resolveNavItem(calls, false), calls)
  assert.equal(resolveNavItem(calls, true).secondary, true)
  assert.equal(resolveNavItem(calls, true).label, 'Calls')
  const home = navigation.flatMap((s) => s.items).find((i) => i.href === '/dashboard')!
  assert.equal(resolveNavItem(home, true).label, 'My Dashboard')
  assert.equal(resolveNavItem(home, false).label, 'Home')
  // same SET of destinations for a manager before/after override (hidden only de-dupes /coaching)
  assert.deepEqual(
    [...new Set(all(true).map((i) => i.href))].sort(),
    [...new Set(navigation.flatMap((s) => s.items).filter((i) => hasAccess(i.roles, true)).map((i) => i.href))].sort(),
  )
})

test('/coaching is the manager Command Centre: managers get Overview, reps get NO link to it', () => {
  const m = all(true).filter((i) => i.href === '/coaching').map((i) => i.label)
  assert.deepEqual(m, ['Overview'])
  // no rep-visible item may point at /coaching (any query), and no item is labelled Command Centre
  const rep = all(false)
  assert.deepEqual(rep.filter((i) => i.href === '/coaching' || i.href.startsWith('/coaching?')), [])
  assert.ok(!rep.some((i) => i.label === 'Command Centre' || i.label === 'Overview'))
  assert.ok(!navigation.flatMap((s) => s.items).some((i) => i.label === 'Command Centre'))
  // the rep's own coaching destination is /assignments
  assert.ok(rep.some((i) => i.label === 'Coaching' && i.href === '/assignments'))
})

test('every /coaching destination in the config is manager-only', () => {
  const items = navigation.flatMap((s) => s.items).filter((i) => i.href === '/coaching' || i.href.startsWith('/coaching?'))
  assert.ok(items.length >= 3)
  for (const i of items) assert.deepEqual(i.roles, ['manager'], i.label)
})

test('hasAccess role matrix', () => {
  assert.equal(hasAccess(undefined, false), true)
  assert.equal(hasAccess([], false), true)
  assert.equal(hasAccess(['all'], false), true)
  assert.equal(hasAccess(['manager'], false), false)
  assert.equal(hasAccess(['manager'], true), true)
  assert.equal(hasAccess(['partneradmin'], false, 'PartnerAdmin'), true)
  assert.equal(hasAccess(['partneradmin'], false, 'SuperAdmin'), true)
  assert.equal(hasAccess(['partneradmin'], true), false)
  assert.equal(hasAccess(['superadmin'], true, 'PartnerAdmin'), false)
  assert.equal(hasAccess(['superadmin'], false, 'SuperAdmin'), true)
})

test('every nav destination maps to an existing App Router page and is inside the shell', () => {
  for (const href of new Set(HREFS)) {
    const p = href.split('?')[0]
    const page = path.join(ROOT, 'src/app', p, 'page.tsx')
    assert.ok(existsSync(page), `${href} -> missing ${page}`)
    assert.ok(isShellPath(p), `${href} is not a shell path`)
  }
})

test('active state: exactly one destination is active on each nav URL', () => {
  const cases: [string, string, string][] = [
    ['/dashboard', '', '/dashboard'],
    ['/call-library', '', '/call-library'],
    ['/call-library', 'tab=sparring', '/call-library?tab=sparring'],
    ['/call-library', 'tab=upload', '/call-library'],
    ['/coaching', 'tab=review', '/coaching?tab=review'],
    ['/coaching', 'tab=assignments', '/coaching?tab=assignments'],
    ['/coaching', '', '/coaching'],
    ['/coaching', 'tab=overview', '/coaching'],
    ['/assignments', '', '/assignments'],
    ['/progress', '', '/progress'],
    ['/team', '', '/team'],
    ['/crm/analytics', '', '/crm/analytics'],
    ['/upload', '', '/upload'],
    ['/calls/abc', '', ''],
  ]
  for (const [pathname, search, expected] of cases) {
    const active = [...new Set(HREFS)].filter((h) => isNavItemActive(h, pathname, search, HREFS))
    assert.deepEqual(active, expected ? [expected] : [], `${pathname}?${search}`)
  }
})

test('active state follows browser back/forward (pure function of URL)', () => {
  const seq: [string, string][] = [['/coaching', 'tab=review'], ['/coaching', ''], ['/coaching', 'tab=review']]
  const rev = '/coaching?tab=review'
  assert.deepEqual(seq.map(([p, s]) => isNavItemActive(rev, p, s, HREFS)), [true, false, true])
  assert.deepEqual(seq.map(([p, s]) => isNavItemActive('/coaching', p, s, HREFS)), [false, true, false])
})
