import { test, expect, Page } from '@playwright/test'
import { setupManager, R1, R2, type Mock } from '../helpers/glass-insights-mocks'

/**
 * Manager Assignments (/coaching?tab=assignments): every cause of "no list" is its own state, SuperAdmin (and every shared
 * manager tier) renders returned rows. Fully mocked; not real-data verification.
 */

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()
const ROWS = [
  { id: 'a1', rep_id: R1, title: 'Objection handling drill', type: 'drill', status: 'assigned', due_at: day(-2), created_at: day(-9) },
  { id: 'a2', rep_id: R2, title: 'Closing practice', type: 'sparring', status: 'assigned', due_at: day(3), created_at: day(-3) },
  { id: 'a3', rep_id: R1, title: 'Budget sparring', type: 'sparring', status: 'completed', due_at: day(-5), completed_at: day(-4), created_at: day(-12) },
]

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1)
}
async function open(page: Page, mock: Mock) {
  await setupManager(page, mock)
  await page.goto('/coaching?tab=assignments')
}

for (const vp of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 375, height: 812 }]) {
  test.describe(`Assignments states ${vp.name} ${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    for (const tier of ['Manager', 'Owner', 'PartnerAdmin', 'SuperAdmin']) {
      test(`${tier}: returned assignments render with summary counts derived from them`, async ({ page }) => {
        await open(page, { tier, assignments: ROWS })
        const list = page.getByRole('list', { name: 'Assignments' })
        await expect(list).toBeVisible({ timeout: 20000 })
        await expect(list.getByRole('listitem')).toHaveCount(3)
        const dd = page.locator('dl').first().locator('dd')
        await expect(dd.nth(0)).toHaveText('1') // open (a2)
        await expect(dd.nth(1)).toHaveText('1') // overdue (a1)
        await expect(dd.nth(2)).toHaveText('1') // completed (a3)
        await expect(page.locator('[data-failure]')).toHaveCount(0)
        await noOverflow(page)
      })
    }

    test('genuine 403: a permission-specific state — no raw error, no summary numbers, no pointless retry', async ({ page }) => {
      await open(page, { assignments: 403 })
      const state = page.locator('[data-failure="permission"]')
      await expect(state).toBeVisible({ timeout: 20000 })
      await expect(state).toContainText('You don’t have access to team assignments')
      await expect(state).toContainText('ask an admin to check your role')
      await expect(state.getByRole('button', { name: 'Try again' })).toHaveCount(0)
      await expect(state.getByRole('link', { name: 'Go to my assignments' })).toHaveAttribute('href', '/assignments')
      const t = await page.locator('main').innerText()
      expect(t).not.toMatch(/couldn’t load|forbidden|403|boom/i)
      // summary does not invent counts
      const dd = page.locator('dl').first().locator('dd')
      await expect(dd.nth(0)).toHaveText('—')
      await expect(dd.nth(1)).toHaveText('—')
      await expect(dd.nth(2)).toHaveText('—')
      await page.screenshot({ path: `test-results/glass/assignments-403-${vp.name}.png`, fullPage: true })
      await noOverflow(page)
    })

    test('401: a session state with a way to sign in', async ({ page }) => {
      await open(page, { assignments: 401 })
      const state = page.locator('[data-failure="unauthenticated"]')
      await expect(state).toBeVisible({ timeout: 20000 })
      await expect(state.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login')
    })

    test('500: a server-failure state that says it is not the user’s account, with retry; no backend text', async ({ page }) => {
      await open(page, { assignments: 500 })
      const state = page.locator('[data-failure="server"]')
      await expect(state).toBeVisible({ timeout: 20000 })
      await expect(state).toContainText('Assignments are temporarily unavailable')
      await expect(state).toContainText('not with your account')
      await expect(state.getByRole('button', { name: 'Try again' })).toBeVisible()
      expect(await page.locator('main').innerText()).not.toMatch(/secret backend text|boom/)
    })

    test('network failure and a 200 with no list are not "no assignments"', async ({ page }) => {
      await open(page, { assignments: 'network' })
      await expect(page.locator('[data-failure="network"]')).toContainText('Couldn’t reach Gravix', { timeout: 20000 })
      const p2 = await page.context().newPage()
      await p2.setViewportSize({ width: vp.width, height: vp.height })
      await open(p2, { assignments: 'no-list' })
      await expect(p2.locator('[data-failure="server"]')).toBeVisible({ timeout: 20000 })
      await expect(p2.getByText('No assignments yet')).toHaveCount(0)
    })

    test('genuinely empty is a different state from every failure', async ({ page }) => {
      await open(page, { assignments: [] })
      await expect(page.getByText('No assignments yet')).toBeVisible({ timeout: 20000 })
      await expect(page.locator('[data-failure]')).toHaveCount(0)
      const dd = page.locator('dl').first().locator('dd')
      await expect(dd.nth(0)).toHaveText('0') // a real, loaded zero
    })

    test('partial failure: rows render, rep-name failure is called out, summary stays accurate', async ({ page }) => {
      await open(page, { assignments: ROWS, roster: 500 })
      const list = page.getByRole('list', { name: 'Assignments' })
      await expect(list).toBeVisible({ timeout: 20000 })
      await expect(list.getByRole('listitem')).toHaveCount(3)
      await expect(page.getByRole('status').filter({ hasText: 'Rep names couldn’t be loaded' })).toBeVisible()
      await expect(list).toContainText('Team member')
      await expect(page.locator('dl').first().locator('dd').nth(0)).toHaveText('1')
    })

    test('a capped list says the counts cover only what is loaded', async ({ page }) => {
      const many = Array.from({ length: 100 }, (_, i) => ({ id: `m${i}`, rep_id: R1, title: `t${i}`, type: 'drill', status: 'assigned', due_at: day(5), created_at: day(-1) }))
      await open(page, { assignments: many })
      await expect(page.getByText('Counts cover the 100 most recent assignments loaded')).toBeVisible({ timeout: 20000 })
    })

    test('filters still work alongside the new states (search, status, rep)', async ({ page }) => {
      await open(page, { assignments: ROWS })
      const items = page.getByRole('list', { name: 'Assignments' }).getByRole('listitem')
      await expect(items).toHaveCount(3, { timeout: 20000 })
      await page.getByLabel('Search assignments').fill('closing')
      await expect(items).toHaveCount(1)
      await page.getByLabel('Search assignments').fill('')
      await page.getByRole('button', { name: 'Overdue', exact: true }).click()
      await expect(items).toHaveCount(1)
      await page.getByRole('button', { name: 'All', exact: true }).click()
      await page.getByLabel('Filter by rep').selectOption(R1)
      await expect(items).toHaveCount(2)
    })
  })
}
