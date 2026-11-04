import { test, expect, Page } from '@playwright/test'
import { fakeRepSession, mockRepApi, REP_UID, MANAGER_UID, type RepApiOpts } from '../helpers/glass-fixtures'

/**
 * Glass system — rep "My Assignments" / Coaching (/assignments). Fully mocked REP session: the manager
 * probe and every manager endpoint answer 403. No Supabase, staging or production traffic; this proves
 * the UI against the live endpoint shapes, not against real data.
 */

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 375, height: 812 },
]
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

async function setup(page: Page, o: RepApiOpts = {}) {
  await fakeRepSession(page)
  await mockRepApi(page, o)
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

const todo = (page: Page) => page.getByRole('list', { name: 'Assignments to do' })
const done = (page: Page) => page.getByRole('list', { name: 'Completed assignments' })
const priorityCard = (page: Page) => page.locator('section, div').filter({ has: page.getByText('Do this first') }).last()

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} ${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test('overview: summary, priority with reason, ordered list, one action per row, no manager controls, no UUIDs', async ({ page }) => {
      const errors = trackConsole(page)
      const managerCalls: string[] = []
      await setup(page, { managerCalls })
      await page.goto('/assignments')
      await expect(page.getByRole('heading', { name: 'My Assignments', level: 1 })).toBeVisible({ timeout: 15000 })
      await expect(todo(page)).toBeVisible()
      // summary: 5 to do, 1 overdue, 2 completed in the last 7 days
      const stats = page.locator('dl').first()
      await expect(stats).toContainText('To do5')
      await expect(stats).toContainText('Overdue1')
      await expect(stats).toContainText('Completed, 7 days2')
      // priority = the overdue sparring drill, with the real reason and the manager's own note
      const priority = priorityCard(page)
      await expect(priority).toContainText('Budget objection sparring')
      await expect(priority).toContainText('From your manager')
      await expect(priority).toContainText('Overdue by 2 days')
      await expect(priority).toContainText('Assigned from a call review (call score 52)')
      await expect(priority).toContainText('Focus on the budget objection')
      await expect(priority.getByRole('link', { name: 'Start sparring' })).toHaveAttribute('href', '/sparring/p-skeptic?assignmentId=a1')
      // skill data from the rep's own feed
      await expect(page.getByText('Weakest area:')).toBeVisible()
      await expect(page.getByRole('link', { name: 'Review suggested call' })).toHaveAttribute('href', '/calls/c-77')
      // list order: overdue, due today, upcoming (earliest), no date last
      const rows = todo(page).getByRole('listitem')
      await expect(rows).toHaveCount(5)
      await expect(rows.nth(0)).toContainText('Budget objection sparring')
      await expect(rows.nth(1)).toContainText('Review your Northwind call')
      await expect(rows.nth(1)).toContainText('Created automatically')
      await expect(rows.nth(1)).toContainText('Due today')
      await expect(rows.nth(4)).toContainText('Update your CRM notes')
      await expect(rows.nth(4)).toContainText('No due date')
      // nothing is claimed that the row does not carry: no source on the row without a manager id
      await expect(rows.nth(4)).not.toContainText('manager')
      // exactly one primary action per row
      await expect(rows.nth(0).getByRole('link', { name: 'Start sparring' })).toHaveCount(1)
      await expect(rows.nth(1).getByRole('link', { name: 'Review call' })).toHaveCount(1)
      await expect(rows.nth(2).getByRole('button', { name: 'Mark complete' })).toHaveCount(1)
      await expect(rows.nth(3).getByRole('link', { name: 'Start sparring' })).toHaveAttribute('href', '/sparring/default?assignmentId=a5')
      await expect(rows.nth(3)).toContainText('No persona set')
      // permission boundary: no manager-only controls or data, no manager requests
      const text = await page.locator('main').innerText()
      for (const banned of ['Create assignment', 'Assignment manager', 'Reassign', 'Nudge', 'Team health', 'Reps requiring attention']) expect(text).not.toContain(banned)
      expect(text).not.toMatch(UUID)
      expect(text).not.toContain(MANAGER_UID)
      expect(managerCalls, 'manager endpoints requested by a rep screen').toEqual([])
      await page.screenshot({ path: `test-results/glass/rep-assignments-${vp.name}.png`, fullPage: true })
      await noHorizontalOverflow(page)
      expect(errors).toEqual([])
    })

    test('To do ↔ Completed, completed detail, filters, URL state survives reload', async ({ page }) => {
      await setup(page)
      await page.goto('/assignments')
      await expect(todo(page)).toBeVisible({ timeout: 15000 })
      await page.getByRole('button', { name: /Completed \(3\)/ }).click()
      await expect(page.getByRole('button', { name: /Completed \(3\)/ })).toHaveAttribute('aria-pressed', 'true')
      const rows = done(page).getByRole('listitem')
      await expect(rows).toHaveCount(3)
      await expect(rows.nth(0)).toContainText('Pricing pushback drill') // newest first
      await expect(rows.nth(0)).toContainText('Sparring session matched')
      await expect(rows.nth(0)).toContainText('score 81%')
      await expect(rows.nth(1)).toContainText('Reviewed by your manager')
      await expect(rows.nth(1).getByRole('link', { name: 'Review result' })).toHaveAttribute('href', '/calls/c-12')
      // completed rows with nothing real to open have no action; none claim feedback
      await expect(rows.nth(2).getByRole('link')).toHaveCount(0)
      await expect(page.getByText('feedback', { exact: false })).toHaveCount(0)
      await page.screenshot({ path: `test-results/glass/rep-completed-${vp.name}.png`, fullPage: true })
      await expect(page).toHaveURL(/view=completed/)
      await page.reload()
      await expect(done(page)).toBeVisible({ timeout: 15000 })
      await page.getByRole('button', { name: /To do/ }).click()
      // filters
      const list = todo(page).getByRole('listitem')
      await page.getByLabel('Filter by type').selectOption('sparring')
      await expect(list).toHaveCount(2)
      await page.getByLabel('Filter by due date').selectOption('overdue')
      await expect(list).toHaveCount(1)
      await expect(page.getByText('Showing 1 of 5')).toBeVisible()
      await expect(page).toHaveURL(/type=sparring&due=overdue/)
      await page.getByLabel('Filter by due date').selectOption('today')
      await expect(page.getByText('No assignments match these filters.')).toBeVisible()
      await page.getByRole('button', { name: 'Clear filters' }).first().click()
      await expect(list).toHaveCount(5)
      await noHorizontalOverflow(page)
    })

    test('empty: calm, no oversized hole; offers real next steps', async ({ page }) => {
      await setup(page, { assignments: [], feed: null })
      await page.goto('/assignments')
      await expect(page.getByText('Nothing is assigned to you right now.')).toBeVisible({ timeout: 15000 })
      await expect(page.getByRole('link', { name: 'Review a call' })).toHaveAttribute('href', '/call-library')
      await expect(page.getByRole('link', { name: 'Practise', exact: true }).first()).toHaveAttribute('href', '/call-library?tab=sparring')
      await expect(page.getByText('You have no assignments to do.')).toBeVisible()
      const h = await page.getByText('You have no assignments to do.').evaluate((el) => el.getBoundingClientRect().height)
      expect(h).toBeLessThan(80)
      await page.screenshot({ path: `test-results/glass/rep-empty-${vp.name}.png`, fullPage: true })
      await noHorizontalOverflow(page)
    })

    test('full error with retry, then recovery', async ({ page }) => {
      await setup(page, { listStatus: 500 })
      await page.goto('/assignments')
      const alert = page.getByRole('alert').filter({ hasText: 'Couldn’t load your assignments' })
      await expect(alert).toBeVisible({ timeout: 15000 })
      await expect(alert).not.toContainText('boom')
      await page.screenshot({ path: `test-results/glass/rep-error-${vp.name}.png`, fullPage: true })
      await page.unroute('**/api/proxy/**')
      await setup(page)
      await alert.getByRole('button', { name: 'Try again' }).click()
      await expect(todo(page)).toBeVisible()
    })

    test('partial error: list works when skill suggestions fail', async ({ page }) => {
      await setup(page, { feedStatus: 500 })
      await page.goto('/assignments')
      await expect(todo(page).getByRole('listitem')).toHaveCount(5, { timeout: 15000 })
      await expect(page.getByText('Skill suggestions are unavailable right now.')).toBeVisible()
      await expect(page.getByText('Weakest area:')).toHaveCount(0)
      await noHorizontalOverflow(page)
    })
  })
}

test.describe('interaction (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('loading state is announced while assignments load', async ({ page }) => {
    await setup(page, { listDelay: 1500 })
    await page.goto('/assignments')
    await expect(page.getByRole('status', { name: 'Loading your assignments' })).toBeVisible({ timeout: 10000 })
    await expect(todo(page)).toBeVisible({ timeout: 15000 })
  })

  test('Mark complete: existing PATCH, row moves to Completed, failure rolls back with a message', async ({ page }) => {
    const completeCalls: string[] = []
    await setup(page, { completeCalls })
    await page.goto('/assignments')
    await expect(todo(page)).toBeVisible({ timeout: 15000 })
    await todo(page).getByRole('listitem').filter({ hasText: 'Write three discovery questions' }).getByRole('button', { name: 'Mark complete' }).click()
    await expect(page.getByText('Assignment completed')).toBeVisible()
    expect(completeCalls).toHaveLength(1)
    expect(completeCalls[0]).toContain('/v1/assignments/a3/complete')
    await expect(todo(page).getByRole('listitem')).toHaveCount(4)
    await page.getByRole('button', { name: /Completed \(4\)/ }).click()
    await expect(done(page)).toContainText('Write three discovery questions')

    // failure: rolled back, calm message
    await page.unroute('**/api/proxy/**')
    await setup(page, { completeStatus: 500 })
    await page.reload()
    await expect(done(page)).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: /To do/ }).click()
    await todo(page).getByRole('listitem').filter({ hasText: 'Write three discovery questions' }).getByRole('button', { name: 'Mark complete' }).click()
    await expect(page.getByText('Couldn’t mark this assignment complete. Try again.')).toBeVisible()
    await expect(todo(page).getByRole('listitem').filter({ hasText: 'Write three discovery questions' })).toHaveCount(1)
  })

  test('Snooze 24h hides a coaching task and Show again restores it', async ({ page }) => {
    await setup(page)
    await page.goto('/assignments')
    await expect(todo(page)).toBeVisible({ timeout: 15000 })
    await todo(page).getByRole('listitem').filter({ hasText: 'Write three discovery questions' }).getByRole('button', { name: 'Snooze 24h' }).click()
    await expect(todo(page).getByRole('listitem')).toHaveCount(4)
    await page.getByRole('button', { name: 'Show again' }).click()
    await expect(todo(page).getByRole('listitem')).toHaveCount(5)
  })

  test('open an assignment, go back (same filters), then forward; Completed tab retained on return', async ({ page }) => {
    await setup(page)
    await page.goto('/assignments')
    await expect(todo(page)).toBeVisible({ timeout: 15000 })
    await page.getByLabel('Filter by type').selectOption('sparring')
    await todo(page).getByRole('listitem').first().getByRole('link', { name: 'Start sparring' }).click()
    await expect(page).toHaveURL(/\/sparring\/p-skeptic\?assignmentId=a1/)
    await page.goBack()
    await expect(page).toHaveURL(/\/assignments\?type=sparring/)
    await expect(todo(page).getByRole('listitem')).toHaveCount(2, { timeout: 15000 })
    await expect(page.getByLabel('Filter by type')).toHaveValue('sparring')
    await page.goForward()
    await expect(page).toHaveURL(/\/sparring\/p-skeptic/)

    await page.goto('/assignments?view=completed')
    await expect(done(page)).toBeVisible({ timeout: 15000 })
    await done(page).getByRole('link', { name: 'Review result' }).click()
    await expect(page).toHaveURL(/\/calls\/c-12$/)
    await page.goBack()
    await expect(done(page)).toBeVisible({ timeout: 15000 })
  })

  test('keyboard: primary action is reachable by Tab, has a visible focus ring, Enter opens it', async ({ page }) => {
    await setup(page)
    await page.goto('/assignments')
    await expect(todo(page)).toBeVisible({ timeout: 15000 })
    const link = priorityCard(page).getByRole('link', { name: 'Start sparring' })
    await page.getByRole('button', { name: 'Refresh' }).focus()
    for (let i = 0; i < 6 && !(await link.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab')
    await expect(link).toBeFocused()
    const ring = await link.evaluate((el) => { const s = getComputedStyle(el); return `${s.outlineStyle} ${s.boxShadow}` })
    expect(ring).not.toMatch(/^none none$/)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/sparring\/p-skeptic/)
  })

  test('permission boundary: rep sidebar has no manager destinations; no manager requests', async ({ page }) => {
    const managerCalls: string[] = []
    await setup(page, { managerCalls })
    await page.goto('/assignments')
    const aside = page.locator('aside').first()
    await expect(aside).toBeVisible({ timeout: 15000 })
    await expect(aside.getByRole('link', { name: 'Coaching', exact: true })).toBeVisible()
    for (const label of ['Team', 'Reviews', 'Insights', 'Assignments', 'Overview']) {
      await expect(aside.getByRole('link', { name: label, exact: true })).toHaveCount(0)
    }
    await page.waitForTimeout(500)
    expect(managerCalls).toEqual([])
  })

  test('no UUID or internal id is ever rendered, including during load', async ({ page }) => {
    await page.addInitScript(([src]) => {
      const re = new RegExp(src, 'i')
      ;(window as any).__seen = []
      const scan = () => { const m = (document.body?.innerText ?? '').match(re); if (m) (window as any).__seen.push(m[0]) }
      new MutationObserver(scan).observe(document, { childList: true, subtree: true, characterData: true })
    }, [UUID.source])
    await setup(page, { listDelay: 600 })
    await page.goto('/assignments')
    await expect(todo(page)).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: /Completed/ }).click()
    await page.waitForTimeout(500)
    expect(await page.evaluate(() => (window as any).__seen)).toEqual([])
    expect(await page.locator('body').innerText()).not.toContain(REP_UID)
  })
})
