import { test, expect } from '@playwright/test'
import { fakeRepSession, mockRepApi, fakeManagerSession, mockManagerApi } from '../helpers/glass-fixtures'

/**
 * Release hygiene on a PRODUCTION build (`next build && next start`): diagnostics are gone or protected.
 * (Under `next dev` the dev-only preview is intentionally available, so run this spec against a production build.)
 */
test.use({ viewport: { width: 1280, height: 800 } })

test('removed diagnostic routes are 404 with no session', async ({ request }) => {
  for (const path of ['/probe', '/api/env', '/dev/audio-test', '/dev/scoring-v2-preview']) {
    const res = await request.get(path)
    expect(res.status(), path).toBe(404)
  }
})

test('/api/ping and compatibility redirects still work', async ({ request }) => {
  expect((await request.get('/api/ping')).status()).toBe(200)
  const res = await request.get('/recent-calls', { maxRedirects: 0 })
  expect([307, 308]).toContain(res.status())
})

test('/health: a rep is redirected, a manager (not super) is redirected, no raw proxy body is shown', async ({ page }) => {
  await fakeRepSession(page)
  await mockRepApi(page)
  await page.goto('/health')
  await expect(page).toHaveURL(/\/assignments$/, { timeout: 15000 })
  expect(await page.locator('body').innerText()).not.toMatch(/x-proxy-api-base|Raw body/i)
})

test('manager: /health is not available without the super level; /crm/contacts/import lands on the real importer', async ({ page }) => {
  await fakeManagerSession(page)
  await mockManagerApi(page)
  await page.route('**/api/proxy/v1/admin/super/health', (r) => r.fulfill({ status: 403, contentType: 'application/json', body: '{"ok":false}' }))
  await page.goto('/health')
  await expect(page).toHaveURL(/\/assignments$/, { timeout: 15000 })
  await page.goto('/crm/contacts/import')
  await expect(page).toHaveURL(/\/crm\/import$/, { timeout: 15000 })
  await expect(page.getByRole('heading', { name: 'Import Contacts' })).toBeVisible({ timeout: 15000 })
  expect(await page.locator('main').innerText()).not.toMatch(/Route fixed|wire your existing/i)
})

test('signed-out home has no link to the missing /proxy/health', async ({ page }) => {
  await page.goto('/')
  await page.waitForTimeout(1000)
  expect(await page.locator('a[href="/proxy/health"]').count()).toBe(0)
})

test('a failed load shows calm copy, never the raw API code', async ({ page }) => {
  await fakeManagerSession(page)
  await mockManagerApi(page)
  await page.route('**/api/proxy/v1/crm/manager/overview', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'Missing or invalid x-org-id' }) }))
  await page.route('**/api/proxy/v1/crm/accounts**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'load_failed missing_user' }) }))
  for (const path of ['/crm/manager', '/crm/accounts']) {
    await page.goto(path)
    await page.waitForTimeout(1800)
    const text = await page.locator('main').innerText()
    expect(text, path).not.toMatch(/x-org-id|missing_user|load_failed|_failed|HTTP \d/)
  }
})
