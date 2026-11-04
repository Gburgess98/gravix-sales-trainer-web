import { test, expect, Page } from '@playwright/test'
import { fakeRepSession, fakeManagerSession, mockRepApi, mockManagerApi, REP_ASSIGNMENTS } from '../helpers/glass-fixtures'

/**
 * Role boundary for /coaching (the manager Command Centre). Mocked sessions only; no real data.
 * Reps: no nav link, direct load redirects to /assignments without rendering manager UI.
 * Managers: unchanged access.
 */
test.use({ viewport: { width: 1440, height: 900 } })

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

/** Records any manager-shell text or error string that is ever in the DOM, from first paint on. */
async function watchForLeaks(page: Page) {
  await page.addInitScript(() => {
    ;(window as any).__leaks = []
    const bad = /Manager Command Centre|forbidden_not_manager|Review Queue|Replay Queue/
    const scan = () => { const m = (document.body?.innerText ?? '').match(bad); if (m) (window as any).__leaks.push(m[0]) }
    new MutationObserver(scan).observe(document, { childList: true, subtree: true, characterData: true })
  })
}
const leaks = (page: Page) => page.evaluate(() => (window as any).__leaks as string[])

test.describe('rep', () => {
  test('navigation has no link to /coaching, in the main list or under More', async ({ page }) => {
    await fakeRepSession(page)
    await mockRepApi(page)
    await page.goto('/assignments')
    const aside = page.locator('aside').first()
    await expect(aside).toBeVisible({ timeout: 15000 })
    const more = aside.getByRole('button', { name: /more/i })
    if (await more.count()) await more.first().click()
    const hrefs = await aside.locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href') || ''))
    expect(hrefs.filter((h) => h === '/coaching' || h.startsWith('/coaching?'))).toEqual([])
    await expect(aside.getByText('Command Centre')).toHaveCount(0)
    await expect(aside.getByRole('link', { name: 'Coaching', exact: true })).toHaveAttribute('href', '/assignments')
  })

  for (const path of ['/coaching', '/coaching?tab=review', '/coaching?tab=assignments']) {
    test(`direct load of ${path} redirects to /assignments; manager UI and errors never render; no manager requests`, async ({ page }) => {
      const managerCalls: string[] = []
      await fakeRepSession(page)
      await watchForLeaks(page)
      await mockRepApi(page, { managerCalls })
      await page.goto(path)
      await expect(page).toHaveURL(/\/assignments$/, { timeout: 15000 })
      await expect(page.getByRole('heading', { name: 'My Assignments', level: 1 })).toBeVisible({ timeout: 15000 })
      expect(await leaks(page)).toEqual([])
      expect(managerCalls, 'manager endpoints requested').toEqual([])
      expect(await page.locator('body').innerText()).not.toContain('forbidden_not_manager')
    })
  }

  test('back/forward after the redirect does not loop', async ({ page }) => {
    await fakeRepSession(page)
    await mockRepApi(page)
    const navs: string[] = []
    page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push(new URL(f.url()).pathname) })
    await page.goto('/dashboard')
    await page.goto('/coaching')
    await expect(page).toHaveURL(/\/assignments$/, { timeout: 15000 })
    await page.waitForTimeout(800)
    const afterRedirect = navs.length
    // /coaching was replaced, not pushed: Back goes to where the rep came from
    await page.goBack()
    await expect(page).toHaveURL(/\/dashboard$/)
    await page.goForward()
    await expect(page).toHaveURL(/\/assignments$/)
    await page.waitForTimeout(800)
    expect(page.url()).not.toContain('/coaching')
    // a loop would revisit /coaching; after the redirect it must never appear again, and the URL stays put
    expect(navs.slice(afterRedirect)).not.toContain('/coaching')
    await page.waitForTimeout(1200)
    expect(new URL(page.url()).pathname).toBe('/assignments')
  })

  test('a failed access check is a calm retry, not a redirect and not manager UI', async ({ page }) => {
    await fakeRepSession(page)
    await watchForLeaks(page)
    await mockRepApi(page)
    await page.route('**/api/proxy/v1/admin/config', (route) => route.fulfill(json({ ok: false, error: 'boom' }, 500)))
    await page.goto('/coaching')
    const alert = page.getByRole('alert').filter({ hasText: 'Couldn’t check your access' })
    await expect(alert).toBeVisible({ timeout: 15000 })
    await expect(page).toHaveURL(/\/coaching$/)
    await expect(alert).not.toContainText('boom')
    expect(await leaks(page)).toEqual([])
    // access check now says rep → redirect
    await page.unroute('**/api/proxy/v1/admin/config')
    await alert.getByRole('button', { name: 'Try again' }).click()
    await expect(page).toHaveURL(/\/assignments$/, { timeout: 15000 })
  })

  test('unknown assignment type is view-only: no Mark complete, no completion request', async ({ page }) => {
    const completeCalls: string[] = []
    await fakeRepSession(page)
    await mockRepApi(page, { assignments: [{ ...REP_ASSIGNMENTS[3], id: 'x1', type: 'drill', title: 'Legacy drill item' }], completeCalls })
    await page.goto('/assignments')
    const row = page.getByRole('list', { name: 'Assignments to do' }).getByRole('listitem').first()
    await expect(row).toContainText('Legacy drill item', { timeout: 15000 })
    await expect(page.getByRole('button', { name: 'Mark complete' })).toHaveCount(0)
    await row.getByRole('button', { name: 'View assignment' }).click()
    await expect(row.getByRole('button', { name: 'Hide assignment' })).toHaveAttribute('aria-expanded', 'true')
    await expect(row).toContainText('can’t be completed from here')
    expect(completeCalls).toEqual([])
  })
})

test.describe('manager', () => {
  test('keeps /coaching: Overview in the nav, Command Centre renders, deep links work, no redirect', async ({ page }) => {
    await fakeManagerSession(page)
    await mockManagerApi(page)
    await page.goto('/coaching')
    await expect(page).toHaveURL(/\/coaching$/)
    await expect(page.getByRole('heading', { name: 'Reps requiring attention' })).toBeVisible({ timeout: 15000 })
    const aside = page.locator('aside').first()
    await expect(aside.getByRole('link', { name: 'Overview', exact: true })).toHaveAttribute('href', '/coaching')
    await expect(aside.getByRole('link', { name: 'Reviews', exact: true })).toHaveAttribute('href', '/coaching?tab=review')
    await page.goto('/coaching?tab=review')
    await expect(page).toHaveURL(/\/coaching\?tab=review/)
    await expect(page.getByRole('heading', { name: 'Reviews', level: 2 })).toBeVisible({ timeout: 15000 })
    await page.goto('/coaching?tab=assignments')
    await expect(page).toHaveURL(/\/coaching\?tab=assignments/)
    await expect(page.getByRole('heading', { name: 'Assignments', level: 2, exact: true })).toBeVisible({ timeout: 15000 })
  })

  test('manager still reaches their own queue at /assignments (My Assignments under More)', async ({ page }) => {
    await fakeManagerSession(page)
    await mockManagerApi(page)
    await page.goto('/assignments')
    await expect(page.getByRole('heading', { name: 'My Assignments', level: 1 })).toBeVisible({ timeout: 15000 })
    await expect(page).toHaveURL(/\/assignments$/)
  })
})
