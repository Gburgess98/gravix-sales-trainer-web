import { test, expect, Page } from '@playwright/test'
import { fakeManagerSession, mockManagerApi } from '../helpers/glass-fixtures'

/**
 * Glass system — manager navigation + the two redesigned routes (/coaching Overview, /team).
 * Fully mocked (see helpers/glass-fixtures): no Supabase, staging or production traffic.
 */

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 375, height: 812 },
]

async function setup(page: Page, opts: { empty?: boolean } = {}) {
  await fakeManagerSession(page)
  await mockManagerApi(page, opts)
}

async function noHorizontalOverflow(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(over, 'horizontal overflow (px)').toBeLessThanOrEqual(1)
  // The shell clips the document, so also assert no content is wider than the viewport.
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

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} ${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test('Manager Overview: summary, sections, disclosure, no overflow', async ({ page }) => {
      const errors = trackConsole(page)
      await setup(page)
      await page.goto('/coaching')
      await expect(page.getByText('Reps requiring attention')).toBeVisible({ timeout: 15000 })
      await expect(page.getByText('Needs attention', { exact: true }).first()).toBeVisible()
      await expect(page.getByText('2 reps need attention')).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Outstanding coaching' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Recent reviews' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Skill trend' })).toBeVisible()
      await expect(page.getByText('-8')).toBeVisible()
      await page.screenshot({ path: `test-results/glass/overview-${vp.name}.png`, fullPage: true })
      // Legacy detail is collapsed by default and opens on demand.
      const disclosure = page.locator('details:has(> summary:has-text("Detailed queues and insights"))')
      await expect(disclosure).not.toHaveAttribute('open', '')
      await disclosure.locator('> summary').click()
      await expect(disclosure).toHaveAttribute('open', '')
      await noHorizontalOverflow(page)
      expect(errors).toEqual([])
    })

    test('Manager Overview: empty team is calm, not a hole', async ({ page }) => {
      await setup(page, { empty: true })
      await page.goto('/coaching')
      await expect(page.getByText('Every rep is on track')).toBeVisible({ timeout: 15000 })
      await expect(page.getByText('Nothing needs your attention right now.')).toBeVisible()
      await page.screenshot({ path: `test-results/glass/overview-empty-${vp.name}.png`, fullPage: true })
      await noHorizontalOverflow(page)
    })

    test('Team: search, filter, attention-first order, rep entry link, no overflow', async ({ page }) => {
      const errors = trackConsole(page)
      await setup(page)
      await page.goto('/team')
      const list = page.getByRole('list', { name: 'Team members' })
      await expect(list).toBeVisible({ timeout: 15000 })
      await expect(list.getByRole('listitem')).toHaveCount(5)
      // needs-attention reps sort first
      await expect(list.getByRole('listitem').first()).toContainText('Alex Johnson')
      await page.screenshot({ path: `test-results/glass/team-${vp.name}.png`, fullPage: true })
      await page.getByLabel('Search team').fill('priya')
      await expect(list.getByRole('listitem')).toHaveCount(1)
      await page.getByLabel('Search team').fill('')
      await page.getByRole('button', { name: 'Needs attention' }).click()
      await expect(list.getByRole('listitem')).toHaveCount(2)
      await expect(list.getByRole('link').first()).toHaveAttribute('href', '/crm/reps/r1')
      await noHorizontalOverflow(page)
      expect(errors).toEqual([])
    })

    test('Team: keyboard — search focus, filter via keyboard, row link focusable', async ({ page }) => {
      await setup(page)
      await page.goto('/team')
      await expect(page.getByRole('list', { name: 'Team members' })).toBeVisible({ timeout: 15000 })
      await page.getByLabel('Search team').focus()
      await page.keyboard.press('Tab')
      await expect(page.getByRole('button', { name: 'All' })).toBeFocused()
      await page.keyboard.press('Tab')
      await page.keyboard.press('Enter')
      await expect(page.getByRole('button', { name: 'Needs attention' })).toHaveAttribute('aria-pressed', 'true')
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await expect(page.getByRole('list', { name: 'Team members' }).getByRole('link').first()).toBeFocused()
    })

    test('Team: empty roster', async ({ page }) => {
      await setup(page, { empty: true })
      await page.goto('/team')
      await expect(page.getByText('No team members yet')).toBeVisible({ timeout: 15000 })
      await noHorizontalOverflow(page)
    })
  })
}

test.describe('Manager navigation', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('sidebar moves Overview → Team → Calls (with Practice and Uploads tabs) without errors', async ({ page }) => {
    const errors = trackConsole(page)
    await setup(page)
    await page.goto('/coaching')
    const aside = page.locator('aside').first()
    await expect(aside).toBeVisible({ timeout: 15000 })
    await aside.getByRole('link', { name: 'Team', exact: true }).click()
    await expect(page).toHaveURL(/\/team/)
    await expect(page.getByRole('heading', { name: 'Team', level: 1 })).toBeVisible()
    await aside.getByRole('link', { name: 'Overview', exact: true }).click()
    await expect(page).toHaveURL(/\/coaching/)
    await expect(page.getByRole('heading', { name: 'Reps requiring attention' })).toBeVisible({ timeout: 15000 })
    // Calls is a "More" destination for managers; expand the group like a user would.
    const more = aside.getByRole('button', { name: /more/i })
    if ((await aside.getByRole('link', { name: 'Calls', exact: true }).count()) === 0) await more.first().click()
    await aside.getByRole('link', { name: 'Calls', exact: true }).click()
    await expect(page).toHaveURL(/call-library/)
    await page.getByRole('button', { name: 'Practice' }).click()
    await expect(page.getByRole('heading', { name: 'Practice', level: 1 })).toBeVisible()
    await expect(page.getByText('Recent sessions')).toBeVisible()
    await page.screenshot({ path: 'test-results/glass/practice-desktop.png', fullPage: true })
    await page.getByRole('button', { name: 'Call Uploads' }).click()
    await expect(page.getByText('Uploaded calls').first()).toBeVisible()
    await page.screenshot({ path: 'test-results/glass/uploads-desktop.png', fullPage: true })
    expect(errors).toEqual([])
  })

  test('Overview actions switch tabs (keyboard Enter on Review queue)', async ({ page }) => {
    await setup(page)
    await page.goto('/coaching')
    const btn = page.getByRole('button', { name: /Review queue/ }).first()
    await expect(btn).toBeVisible({ timeout: 15000 })
    await btn.focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/coaching/)
    await expect(page.getByText('Reps requiring attention')).toHaveCount(0)
  })
})
