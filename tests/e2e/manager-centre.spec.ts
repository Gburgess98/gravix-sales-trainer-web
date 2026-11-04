import { test, expect, Page } from '@playwright/test'
import { spawn, type ChildProcess } from 'node:child_process'
import { fakeManagerSession, mockManagerApi, fakeRepSession, mockRepApi } from '../helpers/glass-fixtures'

/**
 * Manager Centre (/crm/manager) regression — hosted crash, digest 3227098399:
 *   TypeError: fetch failed … ECONNREFUSED 127.0.0.1:3000
 * The page used to be a server component that fetched its own /api/proxy over HTTP from the server, using
 * NEXT_PUBLIC_WEB_URL / NEXT_PUBLIC_APP_URL or a localhost:3000 default. Hosted has no such variable, so it threw.
 *
 * This spec reproduces the hosted condition: it starts the production build on :3101 with those variables
 * pointing at a closed port. Against the old page every test here fails (full "Application error"); against the
 * fix the page never makes a server-side self-fetch. Requires a build (`next build`). Mocked browser traffic only.
 */
const PORT = 3101
let server: ChildProcess | null = null

test.use({ baseURL: `http://localhost:${PORT}`, viewport: { width: 1440, height: 900 } })

test.beforeAll(async () => {
  test.setTimeout(90_000)
  server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    env: { ...process.env, NEXT_PUBLIC_WEB_URL: 'http://127.0.0.1:1', NEXT_PUBLIC_APP_URL: 'http://127.0.0.1:1' },
    stdio: 'ignore',
  })
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`http://localhost:${PORT}/login`)).ok) return } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('next start did not come up on :3101 (run `next build` first)')
})
test.afterAll(() => { server?.kill('SIGTERM') })

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })
const OVERVIEW = { ok: true, mode: 'live', items: [{ rep_id: 'r1', rep_name: 'Alex Johnson', counts: { open: 2, overdue: 1, completed_today: 0 } }] }

async function managerSetup(page: Page, overview: () => { status: number; body: unknown } = () => ({ status: 200, body: OVERVIEW })) {
  await fakeManagerSession(page)
  await mockManagerApi(page)
  await page.route('**/api/proxy/v1/crm/manager/overview', (route) => { const o = overview(); return route.fulfill(json(o.body, o.status)) })
}

function trackConsole(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()) })
  return errors
}

const appCrash = (page: Page) => page.getByText(/Application error|a server-side exception has occurred/i)

test.describe('manager', () => {
  test('direct load renders Manager Centre — no application error, no digest', async ({ page }) => {
    const errors = trackConsole(page)
    await managerSetup(page)
    const res = await page.goto('/crm/manager')
    expect(res?.ok()).toBe(true)
    await expect(page.getByRole('heading', { name: 'Team', level: 1 })).toBeVisible({ timeout: 15000 })
    await expect(appCrash(page)).toHaveCount(0)
    await expect(page.getByText('Alex Johnson').first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('link', { name: 'Open Control Centre' })).toBeVisible()
    expect(await page.content()).not.toMatch(/"digest":"\d+"/)
    expect(errors).toEqual([])
    await page.screenshot({ path: 'test-results/glass/manager-centre-desktop.png', fullPage: true })
  })

  test('a failed overview is a page-level notice with retry (raw API error never shown); retry recovers', async ({ page }) => {
    let fail = true
    await managerSetup(page, () => (fail ? { status: 500, body: { ok: false, error: 'Missing or invalid x-org-id' } } : { status: 200, body: OVERVIEW }))
    await page.goto('/crm/manager')
    const notice = page.getByRole('alert').filter({ hasText: 'Team overview could not be loaded right now' })
    await expect(notice).toBeVisible({ timeout: 15000 })
    await expect(appCrash(page)).toHaveCount(0)
    expect(await page.locator('body').innerText()).not.toContain('x-org-id')
    await expect(page.getByRole('link', { name: 'Open Control Centre' })).toBeVisible()
    fail = false
    await notice.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByText('Alex Johnson').first()).toBeVisible({ timeout: 15000 })
    await expect(notice).toHaveCount(0)
  })

  test('sidebar navigation, refresh, back and forward', async ({ page }) => {
    await managerSetup(page)
    await page.goto('/coaching')
    const aside = page.locator('aside').first()
    await expect(aside).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('heading', { name: 'Reps requiring attention' })).toBeVisible({ timeout: 15000 })
    await aside.getByRole('button', { name: /more/i }).first().click()
    await aside.getByRole('link', { name: 'Manager Centre', exact: true }).click()
    await expect(page).toHaveURL(/\/crm\/manager$/)
    await expect(page.getByRole('heading', { name: 'Team', level: 1 })).toBeVisible({ timeout: 15000 })
    await expect(appCrash(page)).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Team', level: 1 })).toBeVisible({ timeout: 15000 })
    await expect(appCrash(page)).toHaveCount(0)
    await page.goBack()
    await expect(page).toHaveURL(/\/coaching$/)
    await expect(page.getByRole('heading', { name: 'Reps requiring attention' })).toBeVisible({ timeout: 15000 })
    await page.goForward()
    await expect(page).toHaveURL(/\/crm\/manager$/)
    await expect(page.getByRole('heading', { name: 'Team', level: 1 })).toBeVisible({ timeout: 15000 })
  })
})

test.describe('rep', () => {
  test('is redirected to /assignments; no manager UI, no raw error, no manager requests, no loop', async ({ page }) => {
    const managerCalls: string[] = []
    await fakeRepSession(page)
    await mockRepApi(page, { managerCalls })
    await page.addInitScript(() => {
      ;(window as any).__leaks = []
      const bad = /Open Control Centre|Team overview|forbidden_not_manager|Auto-assign/
      new MutationObserver(() => { const m = (document.body?.innerText ?? '').match(bad); if (m) (window as any).__leaks.push(m[0]) }).observe(document, { childList: true, subtree: true, characterData: true })
    })
    const navs: string[] = []
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(new URL(f.url()).pathname) })
    await page.goto('/dashboard')
    await page.goto('/crm/manager')
    await expect(page).toHaveURL(/\/assignments$/, { timeout: 15000 })
    await expect(page.getByRole('heading', { name: 'My Assignments', level: 1 })).toBeVisible({ timeout: 15000 })
    expect(await page.evaluate(() => (window as any).__leaks)).toEqual([])
    expect(managerCalls).toEqual([])
    const after = navs.length
    await page.goBack()
    await expect(page).toHaveURL(/\/dashboard$/)
    await page.goForward()
    await expect(page).toHaveURL(/\/assignments$/)
    await page.waitForTimeout(800)
    expect(navs.slice(after)).not.toContain('/crm/manager')
    expect(await page.locator('body').innerText()).not.toContain('forbidden_not_manager')
  })
})
