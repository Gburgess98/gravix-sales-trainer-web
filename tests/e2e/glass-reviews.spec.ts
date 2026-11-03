import { test, expect, Page } from '@playwright/test'
import { fakeManagerSession, mockManagerApi, REVIEW_QUEUE, ORPHAN_REP_ID } from '../helpers/glass-fixtures'

/**
 * Glass system — manager Reviews queue (/coaching?tab=review). Fully mocked: no Supabase, staging or
 * production traffic. This proves the UI against the live endpoint's shape, not against real data.
 */

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 375, height: 812 },
]
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

type Opts = { queue?: unknown; queueStatus?: number; queueDelay?: number; ccFail?: boolean; rosterDelay?: number }

async function setup(page: Page, o: Opts = {}) {
  await fakeManagerSession(page)
  await mockManagerApi(page)
  // Registered after the shared mock, so these take priority.
  await page.route('**/api/proxy/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/v1/manager/review-queue')) {
      if (o.queueDelay) await new Promise((r) => setTimeout(r, o.queueDelay))
      return route.fulfill(json(o.queue ?? REVIEW_QUEUE, o.queueStatus ?? 200))
    }
    if (o.ccFail && url.includes('/v1/manager/command-centre')) return route.fulfill(json({ ok: false, error: 'down' }, 500))
    if (o.rosterDelay && url.includes('/v1/team/members')) await new Promise((r) => setTimeout(r, o.rosterDelay))
    if (url.includes('/manager-review') && route.request().method() === 'POST') return route.fulfill(json({ ok: true }))
    return route.fallback()
  })
}

async function noHorizontalOverflow(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(over, 'horizontal overflow (px)').toBeLessThanOrEqual(1)
  const wide = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    return Array.from(document.querySelectorAll('main section, main [class*="ds-panel"], main [class*="ds-glass"]'))
      .filter((el) => el.getBoundingClientRect().right > vw + 1)
      .map((el) => (el.textContent || '').slice(0, 40))
  })
  expect(wide, 'panels wider than the viewport').toEqual([])
}

function trackConsole(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text())
  })
  return errors
}

const list = (page: Page) => page.getByRole('list', { name: 'Calls waiting for review' })

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} ${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test('queue: summary, rows with names, one primary action each, no UUIDs, no overflow', async ({ page }) => {
      const errors = trackConsole(page)
      await setup(page)
      await page.goto('/coaching?tab=review')
      await expect(list(page)).toBeVisible({ timeout: 15000 })
      const rows = list(page).getByRole('listitem')
      await expect(rows).toHaveCount(4)
      // lowest score first
      await expect(rows.first()).toContainText('Acme discovery call')
      await expect(rows.first()).toContainText('Alex Johnson')
      await expect(rows.first()).toContainText('Score 48')
      await expect(rows.first()).toContainText('Today')
      // age is derived from the call date and labelled as such; long waits are flagged
      await expect(rows.filter({ hasText: 'Orbit renewal' })).toContainText('Waiting 9 days')
      await expect(page.getByText('by call date')).toBeVisible()
      // summary: 4 waiting, 2 waiting 3+ days (5d, 9d), 1 below 55, 31 reviewed (command centre)
      const stats = page.locator('dl').first()
      await expect(stats).toContainText('Waiting for review4')
      await expect(stats).toContainText('Waiting 3+ days2')
      await expect(stats).toContainText('Score below 551')
      await expect(stats).toContainText('Reviewed, 30 days31')
      // exactly one primary action per row; secondary actions are present but not primary
      await expect(list(page).getByRole('link', { name: 'Review call' })).toHaveCount(4)
      await expect(list(page).getByRole('button', { name: 'Mark reviewed' })).toHaveCount(4)
      await expect(list(page).getByRole('button', { name: 'Assign coaching' })).toHaveCount(4)
      // waiting calls are never listed under "Recently reviewed"
      await expect(page.getByRole('heading', { name: 'Waiting for review' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Recently reviewed' })).toBeVisible()
      await expect(page.getByRole('list', { name: 'Reviewed in this session' })).toHaveCount(0)
      // unresolved rep: neutral label, never the UUID or "Unknown rep"
      await expect(rows.filter({ hasText: 'Orbit renewal' })).toContainText('Team member')
      const text = await page.locator('main').innerText()
      expect(text).not.toMatch(UUID)
      expect(text).not.toContain('Unknown rep')
      await page.screenshot({ path: `test-results/glass/reviews-${vp.name}.png`, fullPage: true })
      await noHorizontalOverflow(page)
      expect(errors).toEqual([])
    })

    test('filters: search, score band, rep, age, sort, clear, no-match', async ({ page }) => {
      await setup(page)
      await page.goto('/coaching?tab=review')
      const rows = list(page).getByRole('listitem')
      await expect(rows).toHaveCount(4, { timeout: 15000 })

      await page.getByLabel('Search reviews').fill('sam')
      await expect(rows).toHaveCount(1)
      await expect(rows.first()).toContainText('TechFlow demo')
      await page.getByLabel('Search reviews').fill('')

      await page.getByRole('button', { name: 'Below 55' }).click()
      await expect(rows).toHaveCount(1)
      await expect(page.getByRole('button', { name: 'Below 55' })).toHaveAttribute('aria-pressed', 'true')
      await page.getByRole('button', { name: 'All', exact: true }).click()

      await page.getByLabel('Filter by rep').selectOption({ label: 'Alex Johnson' })
      await expect(rows).toHaveCount(2)
      await page.getByLabel('Filter by age').selectOption('waiting3')
      await expect(rows).toHaveCount(1)
      await expect(rows.first()).toContainText('Northwind follow-up')
      await expect(page.getByText('Showing 1 of 4')).toBeVisible()
      await page.getByRole('button', { name: 'Clear filters' }).click()
      await expect(rows).toHaveCount(4)

      await page.getByLabel('Sort reviews').selectOption('oldest')
      await expect(rows.first()).toContainText('Orbit renewal')

      await page.getByLabel('Search reviews').fill('zzzz')
      await expect(page.getByText('No reviews match these filters.')).toBeVisible()
      await page.getByRole('button', { name: 'Clear filters' }).last().click()
      await expect(rows).toHaveCount(4)
      await noHorizontalOverflow(page)
    })

    test('empty queue is compact, not a hole', async ({ page }) => {
      await setup(page, { queue: { ok: true, windowDays: 30, items: [], count: 0 } })
      await page.goto('/coaching?tab=review')
      await expect(page.getByText('Nothing is waiting for review.')).toBeVisible({ timeout: 15000 })
      const h = await page.getByText('Nothing is waiting for review.').evaluate((el) => el.getBoundingClientRect().height)
      expect(h).toBeLessThan(80)
      await page.screenshot({ path: `test-results/glass/reviews-empty-${vp.name}.png`, fullPage: true })
      await noHorizontalOverflow(page)
    })

    test('full error shows retry and recovers', async ({ page }) => {
      await setup(page, { queue: { ok: false, error: 'review_queue_failed' }, queueStatus: 500 })
      await page.goto('/coaching?tab=review')
      const alert = page.getByRole('alert').filter({ hasText: 'Couldn’t load the review queue' })
      await expect(alert).toBeVisible({ timeout: 15000 })
      await page.screenshot({ path: `test-results/glass/reviews-error-${vp.name}.png`, fullPage: true })
      await page.unroute('**/api/proxy/**')
      await setup(page)
      await alert.getByRole('button', { name: /retry|try again/i }).click()
      await expect(list(page)).toBeVisible()
    })

    test('partial error: queue still works when review totals fail', async ({ page }) => {
      await setup(page, { ccFail: true })
      await page.goto('/coaching?tab=review')
      await expect(list(page).getByRole('listitem')).toHaveCount(4, { timeout: 15000 })
      await expect(page.getByText('Review totals are unavailable right now.')).toBeVisible()
      await expect(page.locator('dl').first()).toContainText('Reviewed, 30 days—')
      await noHorizontalOverflow(page)
    })
  })
}

test.describe('interaction', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('loading state is shown while the queue loads', async ({ page }) => {
    await setup(page, { queueDelay: 1500 })
    await page.goto('/coaching?tab=review')
    await expect(page.getByRole('status', { name: 'Loading reviews' })).toBeVisible({ timeout: 10000 })
    await page.screenshot({ path: 'test-results/glass/reviews-loading-desktop.png', fullPage: true })
    await expect(list(page)).toBeVisible({ timeout: 15000 })
  })

  test('Review call opens the call; back returns to the queue; forward returns to the call', async ({ page }) => {
    await setup(page)
    await page.goto('/coaching?tab=review')
    await expect(list(page)).toBeVisible({ timeout: 15000 })
    await list(page).getByRole('listitem').first().getByRole('link', { name: 'Review call' }).click()
    await expect(page).toHaveURL(/\/calls\/c1$/)
    await page.goBack()
    await expect(page).toHaveURL(/\/coaching\?tab=review/)
    await expect(list(page).getByRole('listitem')).toHaveCount(4, { timeout: 15000 })
    await page.goForward()
    await expect(page).toHaveURL(/\/calls\/c1$/)
  })

  test('keyboard: Review call is reachable by Tab and opens with Enter', async ({ page }) => {
    await setup(page)
    await page.goto('/coaching?tab=review')
    await expect(list(page)).toBeVisible({ timeout: 15000 })
    const first = list(page).getByRole('listitem').first().getByRole('link', { name: 'Review call' })
    await page.getByLabel('Search reviews').focus()
    for (let i = 0; i < 12 && !(await first.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab')
    await expect(first).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/calls\/c1$/)
  })

  test('mark reviewed: row leaves the queue, lands under Recently reviewed, focus stays in the section', async ({ page }) => {
    await setup(page)
    let reviewed = false
    await page.route('**/api/proxy/**', async (route) => {
      const url = route.request().url()
      if (url.includes('/manager-review') && route.request().method() === 'POST') { reviewed = true; return route.fulfill(json({ ok: true })) }
      if (reviewed && url.includes('/v1/manager/review-queue')) {
        return route.fulfill(json({ ...REVIEW_QUEUE, count: 3, items: REVIEW_QUEUE.items.filter((i) => i.callId !== 'c1') }))
      }
      return route.fallback()
    })
    await page.goto('/coaching?tab=review')
    await expect(list(page).getByRole('listitem')).toHaveCount(4, { timeout: 15000 })
    await list(page).getByRole('listitem').first().getByRole('button', { name: 'Mark reviewed' }).click()
    await expect(list(page).getByRole('listitem')).toHaveCount(3)
    await expect(page.getByText('Call marked as reviewed.')).toBeVisible()
    const done = page.getByRole('list', { name: 'Reviewed in this session' })
    await expect(done).toContainText('Acme discovery call')
    await expect(done).toContainText('Reviewed just now')
    await expect(done).toContainText('Alex Johnson')
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false)
    await page.screenshot({ path: 'test-results/glass/reviews-marked-desktop.png', fullPage: true })
  })

  test('assign coaching still opens the existing modal with the resolved rep name', async ({ page }) => {
    await setup(page)
    await page.goto('/coaching?tab=review')
    await expect(list(page)).toBeVisible({ timeout: 15000 })
    await list(page).getByRole('listitem').filter({ hasText: 'Orbit renewal' }).getByRole('button', { name: 'Assign coaching' }).click()
    // orphan call: the existing modal opens with the neutral label, never the UUID or "Unknown rep"
    await expect(page.getByText(/Team member · score 66/)).toBeVisible()
    const text = await page.locator('body').innerText()
    expect(text).not.toContain(ORPHAN_REP_ID)
    expect(text).not.toContain('Unknown rep')
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await list(page).getByRole('listitem').first().getByRole('button', { name: 'Assign coaching' }).click()
    await expect(page.getByText('Assign Coaching').first()).toBeVisible()
    await expect(page.getByText(/Alex Johnson · score 48/)).toBeVisible()
  })

  test('no UUID is ever rendered, even while the roster is still loading', async ({ page }) => {
    await page.addInitScript(([src]) => {
      const re = new RegExp(src, 'i')
      ;(window as any).__uuidSeen = []
      const scan = () => { const t = document.body?.innerText ?? ''; const m = t.match(re); if (m) (window as any).__uuidSeen.push(m[0]) }
      new MutationObserver(scan).observe(document, { childList: true, subtree: true, characterData: true })
    }, [UUID.source])
    await setup(page, { rosterDelay: 1200 })
    await page.goto('/coaching?tab=review')
    await expect(list(page)).toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(1800)
    expect(await page.evaluate(() => (window as any).__uuidSeen)).toEqual([])
    await expect(list(page).getByRole('listitem').first()).toContainText('Alex Johnson')
  })
})
