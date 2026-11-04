import { test, expect, Page } from '@playwright/test'
import { fakeRepSession } from '../helpers/glass-fixtures'

/**
 * Shared role guard (RoleGate in segment layouts). Mocked sessions only: each "role" is just which probe endpoint
 * answers 200 vs 403 (the API is the real authority; this proves the UI behaviour, not real data).
 */
test.use({ viewport: { width: 1280, height: 800 } })

type Role = 'rep' | 'manager' | 'partner' | 'super'
const MANAGER = ['/coaching', '/team', '/intelligence', '/admin/settings', '/admin/personas', '/admin/reps', '/admin/assignments', '/admin/assignments/create', '/crm/analytics', '/crm/manager', '/crm/manager/contacts', '/crm/manager/nudges', '/crm/reps/r1', '/crm/overview', '/crm/import', '/crm/contacts/import']
const PARTNER = ['/admin/users', '/admin/users/u1', '/admin/companies', '/admin/companies/c1']
const SUPER = ['/admin/partners', '/admin/score', '/admin/status']
const SHARED = ['/dashboard', '/assignments', '/progress', '/call-library', '/upload', '/crm/accounts', '/crm/pipeline', '/settings/profile']
const RANK: Record<Role, number> = { rep: 0, manager: 1, partner: 2, super: 3 }
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

async function setup(page: Page, role: Role, opts: { probe500?: boolean } = {}) {
  const restricted: string[] = []
  await fakeRepSession(page)
  await page.route('**/api/proxy/**', (route) => {
    const url = route.request().url()
    const probe = url.includes('/v1/admin/config') ? 1 : url.includes('/v1/admin/partner/health') ? 2 : url.includes('/v1/admin/super/health') ? 3 : 0
    if (probe) {
      if (opts.probe500) return route.fulfill(json({ ok: false, error: 'boom' }, 500))
      return RANK[role] >= probe ? route.fulfill(json({ ok: true, config: {} })) : route.fulfill(json({ ok: false, error: 'forbidden_not_manager' }, 403))
    }
    if (/\/v1\/(team|manager|crm\/manager|crm\/analytics|assignments\/manager|admin|intelligence)/.test(url)) {
      restricted.push(url)
      return RANK[role] >= 1 ? route.fulfill(json({ ok: true, items: [], users: [], reps: [], config: {} })) : route.fulfill(json({ ok: false, error: 'forbidden_not_manager' }, 403))
    }
    if (url.includes('/v1/reps/me')) return route.fulfill(json({ ok: true, id: 'x', tier: role }))
    return route.fulfill(json({ ok: true, items: [], assignments: [], calls: [], user: {} }))
  })
  return restricted
}

async function watchLeaks(page: Page) {
  await page.addInitScript(() => {
    ;(window as any).__leaks = []
    const bad = /forbidden|missing_user|Manager workspace|Persona config|User Management|Control plane|CONTROL PLANE|Streak threshold/i
    new MutationObserver(() => { const m = (document.body?.innerText ?? '').match(bad); if (m) (window as any).__leaks.push(m[0]) }).observe(document, { childList: true, subtree: true, characterData: true })
  })
}

test.describe('rep', () => {
  for (const route of [...MANAGER, ...PARTNER, ...SUPER]) {
    test(`${route} → /assignments, nothing restricted renders or is requested`, async ({ page }) => {
      const restricted = await setup(page, 'rep')
      await watchLeaks(page)
      await page.goto(route)
      await expect(page).toHaveURL(/\/assignments$/, { timeout: 15000 })
      await expect(page.getByRole('heading', { name: 'My Assignments', level: 1 })).toBeVisible({ timeout: 15000 })
      expect(await page.evaluate(() => (window as any).__leaks)).toEqual([])
      expect(restricted, 'restricted endpoints requested before the guard decided').toEqual([])
    })
  }

  test('shared routes stay open for a rep (no over-blocking)', async ({ page }) => {
    await setup(page, 'rep')
    for (const route of SHARED) {
      await page.goto(route)
      await page.waitForTimeout(1200)
      expect(new URL(page.url()).pathname, route).toBe(route)
      await expect(page.getByRole('status', { name: 'Checking access' })).toHaveCount(0)
    }
  })

  test('back/forward after a guarded redirect does not loop', async ({ page }) => {
    await setup(page, 'rep')
    const navs: string[] = []
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(new URL(f.url()).pathname) })
    await page.goto('/dashboard')
    await page.goto('/crm/analytics')
    await expect(page).toHaveURL(/\/assignments$/, { timeout: 15000 })
    const after = navs.length
    await page.goBack()
    await expect(page).toHaveURL(/\/dashboard$/)
    await page.goForward()
    await expect(page).toHaveURL(/\/assignments$/)
    await page.waitForTimeout(800)
    expect(navs.slice(after)).not.toContain('/crm/analytics')
  })
})

test.describe('manager', () => {
  test('manager routes render; partner and super routes redirect', async ({ page }) => {
    await setup(page, 'manager')
    for (const route of ['/team', '/crm/analytics', '/crm/manager/contacts', '/admin/personas', '/intelligence']) {
      await page.goto(route)
      await page.waitForTimeout(1200)
      expect(new URL(page.url()).pathname, route).toBe(route)
    }
    for (const route of ['/admin/users', '/admin/companies', '/admin/partners', '/admin/status']) {
      await page.goto(route)
      await expect(page).toHaveURL(/\/assignments$/, { timeout: 15000 })
    }
  })
})

test.describe('partner admin and super admin', () => {
  test('a partner admin reaches users/companies but not partners/status', async ({ page }) => {
    await setup(page, 'partner')
    for (const route of ['/admin/users', '/admin/companies']) {
      await page.goto(route)
      await page.waitForTimeout(1200)
      expect(new URL(page.url()).pathname, route).toBe(route)
    }
    await page.goto('/admin/partners')
    await expect(page).toHaveURL(/\/assignments$/, { timeout: 15000 })
  })

  test('a super admin reaches everything restricted', async ({ page }) => {
    await setup(page, 'super')
    for (const route of ['/admin/partners', '/admin/status', '/admin/score', '/admin/users', '/team']) {
      await page.goto(route)
      await page.waitForTimeout(1200)
      expect(new URL(page.url()).pathname, route).toBe(route)
    }
  })
})

test('a failed role check is a calm retry — never a redirect, never the page', async ({ page }) => {
  const restricted = await setup(page, 'manager', { probe500: true })
  await watchLeaks(page)
  await page.goto('/admin/reps')
  const alert = page.getByRole('alert').filter({ hasText: 'Couldn’t check your access' })
  await expect(alert).toBeVisible({ timeout: 15000 })
  await expect(page).toHaveURL(/\/admin\/reps$/)
  await expect(alert).not.toContainText('boom')
  expect(await page.evaluate(() => (window as any).__leaks)).toEqual([])
  expect(restricted).toEqual([])
})
