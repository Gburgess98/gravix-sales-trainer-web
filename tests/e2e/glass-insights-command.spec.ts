import { test, expect, Page } from '@playwright/test'
import { setupManager, R1, R2, TREND_FULL, type Mock } from '../helpers/glass-insights-mocks'

/**
 * Manager Insights command centre (/crm/analytics). Fully mocked (fake local session, mocked /api/proxy, Supabase blocked).
 * Proves states and honesty rules — not real-data verification.
 */

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'document overflow').toBeLessThanOrEqual(1)
  const wide = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    return Array.from(document.querySelectorAll('main section, main .ds-panel, main .ds-glass, main [data-testid]')).filter((e) => e.getBoundingClientRect().right > vw + 1).map((e) => (e.textContent ?? '').slice(0, 40))
  })
  expect(wide, 'elements wider than viewport').toEqual([])
}
function track(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|hot-update/.test(m.text())) errors.push(m.text()) })
  return errors
}
const kpi = (page: Page, label: string) => page.locator('main section, main div').filter({ has: page.getByText(label, { exact: true }) }).filter({ hasText: label }).last()
const visibleText = (page: Page) => page.locator('main').innerText()

const VIEWPORTS = [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 375, height: 812 }]

for (const vp of VIEWPORTS) {
  test.describe(`Insights ${vp.name} ${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    async function open(page: Page, mock: Mock = {}, url = '/crm/analytics') {
      await setupManager(page, mock)
      await page.goto(url)
      await expect(page.getByRole('heading', { name: 'Score trend' })).toBeVisible({ timeout: 20000 })
    }

    test('full data: four KPIs, trend with sample sizes, thresholds, attention, skills, follow-through', async ({ page }) => {
      const errors = track(page)
      await open(page)
      await expect(page.getByTestId('data-window')).toContainText('Last scored call:')
      await expect(page.getByTestId('data-window')).toContainText('15 scored calls in the last 365 days')
      // KPIs: real numbers, with open and overdue clearly separate
      await expect(page.getByText('Average score', { exact: true })).toBeVisible()
      const text = await visibleText(page)
      expect(text).toMatch(/Average score\s*\n?\s*62/)
      expect(text).toMatch(/Scored calls\s*\n?\s*15/)
      expect(text).toMatch(/Calls needing review\s*\n?\s*3/)
      await expect(page.getByText('overdue is part of open')).toBeVisible()
      const coaching = page.locator('main').getByText('Coaching', { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"ds-glass")][1]')
      await expect(coaching).toContainText('Open')
      await expect(coaching).toContainText('Overdue')
      await expect(coaching.locator('p.tabular-nums').nth(0)).toHaveText('5')
      await expect(coaching.locator('p.tabular-nums').nth(1)).toHaveText('2')
      // trend: one chart, data table carries each point's sample size
      await expect(page.locator('.recharts-wrapper')).toHaveCount(1)
      const details = page.locator('details:has(> summary:has-text("View as table"))')
      await details.locator('> summary').click()
      await expect(details.locator('tbody tr')).toHaveCount(TREND_FULL.length)
      await expect(details.locator('thead')).toContainText('Scored calls')
      await expect(details.locator('tbody tr').first()).toContainText('2')
      // thresholds: real values, no invented target
      await expect(page.getByText('Low threshold 65 · Critical threshold 45')).toBeVisible()
      await expect(page.getByTestId('gauge-verdict')).toHaveText('Below the low threshold')
      await expect(page.getByTestId('gauge-marker')).toBeVisible()
      await expect(page.getByText(/target/i).first()).toContainText('doesn’t add a target')
      // attention: real reasons and status
      const att = page.getByRole('list', { name: 'Reps needing attention' })
      await expect(att.getByRole('listitem')).toHaveCount(2)
      await expect(att).toContainText('Average score below 55')
      await expect(att).toContainText('Needs attention')
      await expect(att).toContainText('Watch')
      await expect(att.getByRole('link', { name: 'Alex Johnson' })).toHaveAttribute('href', `/crm/reps/${R1}`)
      // skills: up / down / flat / new with sample context
      const skills = page.getByRole('list', { name: 'Weakest skills' })
      await expect(skills).toContainText('Improving')
      await expect(skills).toContainText('Declining')
      await expect(skills).toContainText('Steady')
      await expect(skills).toContainText('New')
      await expect(skills).toContainText('4 calls scored weak')
      await expect(skills).toContainText('↓ from 55')
      // follow-through: completed / open / overdue side by side, no combined rate
      const ft = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Coaching follow-through' }) })
      await expect(ft).toContainText('Completed')
      await expect(ft).toContainText('7')
      await expect(ft.getByText('not combined into a rate')).toBeVisible()
      // nothing the data does not support
      expect(await visibleText(page)).not.toMatch(/revenue|pipeline|\bxp\b|points|duration|flagged/i)
      await page.screenshot({ path: `test-results/glass/insights-command-${vp.name}.png`, fullPage: true })
      await noOverflow(page)
      expect(errors).toEqual([])
    })

    test('sparse: a single scored day is shown honestly, not as a trend', async ({ page }) => {
      await open(page, { trend: 'single', centre: 'full' })
      const single = page.locator('[data-state="single"]')
      await expect(single).toBeVisible()
      await expect(single).toContainText('40')
      await expect(single).toContainText('1 call')
      await expect(single).toContainText('no trend to draw yet')
      await expect(page.locator('.recharts-wrapper')).toHaveCount(0)
      await expect(page.getByTestId('data-window')).toContainText('1 scored call in the last 365 days')
      await page.screenshot({ path: `test-results/glass/insights-sparse-${vp.name}.png`, fullPage: true })
      await noOverflow(page)
    })

    test('empty window: average unavailable (never 0), nothing labelled healthy, real counts kept', async ({ page }) => {
      await open(page, { trend: 'empty', centre: 'empty' }, '/crm/analytics?days=30')
      await expect(page.getByTestId('data-window')).toHaveText('No scored calls in the last 30 days')
      await expect(page.locator('[data-state="empty"]').first()).toBeVisible()
      await expect(page.getByText('This doesn’t mean performance is good or bad')).toBeVisible()
      // average and scored calls
      const avg = page.getByText('Average score', { exact: true }).locator('xpath=ancestor::div[contains(@class,"ds-glass")][1]')
      await expect(avg.getByLabel('Unavailable')).toBeVisible()
      await expect(avg).toContainText('No scored calls in this period')
      await expect(avg).not.toHaveText(/\b0\b/)
      const scored = page.getByText('Scored calls', { exact: true }).locator('xpath=ancestor::div[contains(@class,"ds-glass")][1]')
      await expect(scored).toContainText('0') // a real, confirmed zero sample — the API said scoredCalls: 0
      // gauge has nothing to place, attention does not claim all-clear
      await expect(page.getByTestId('gauge-verdict')).toHaveText('No average to place')
      await expect(page.getByTestId('gauge-marker')).toHaveCount(0)
      await expect(page.getByText('No scored calls, so reps can’t be assessed')).toBeVisible()
      await expect(page.getByText('Show 365 days')).toBeVisible()
      // other real zeros/counts are still shown
      expect(await visibleText(page)).not.toMatch(/healthy|on track|all clear|good shape/i)
      const coaching = page.locator('main').getByText('Coaching', { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"ds-glass")][1]')
      await expect(coaching.locator('p.tabular-nums').nth(0)).toHaveText('2')
      await expect(coaching.locator('p.tabular-nums').nth(1)).toHaveText('1')
      await page.screenshot({ path: `test-results/glass/insights-empty-${vp.name}.png`, fullPage: true })
      await noOverflow(page)
    })

    test('REGRESSION: an older API that reports an empty window as average 0 still shows "unavailable"', async ({ page }) => {
      await open(page, { trend: 'empty', centre: 'legacy-zero' })
      const avg = page.getByText('Average score', { exact: true }).locator('xpath=ancestor::div[contains(@class,"ds-glass")][1]')
      await expect(avg.getByLabel('Unavailable')).toBeVisible()
      await expect(avg).not.toContainText(/^\s*0\s*$/m)
      await expect(page.getByTestId('gauge-verdict')).toHaveText('No average to place')
    })

    test('partial failure: one section fails, the rest render, nothing is shown as empty', async ({ page }) => {
      await open(page, { trend: 500, centre: 'full' })
      await expect(page.getByTestId('partial-failure')).toContainText('score trend')
      const alert = page.locator('[data-state="error"]').first()
      await expect(alert).toContainText('Couldn’t load the score trend')
      await expect(alert).toContainText('not an empty result')
      await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible()
      expect(await visibleText(page)).not.toMatch(/secret backend text|boom/)
      // the command-centre sections still render real data
      await expect(page.getByRole('list', { name: 'Reps needing attention' })).toBeVisible()
      await expect(page.getByRole('list', { name: 'Weakest skills' })).toBeVisible()
      await expect(page.getByTestId('data-window')).toHaveText('Data window unavailable')
      await noOverflow(page)
    })

    test('partial failure: thresholds and CRM tasks fail independently', async ({ page }) => {
      await open(page, { thresholds: 'fail-after-gate', activity: 500 })
      await expect(page.getByTestId('partial-failure')).toContainText('thresholds')
      await expect(page.getByTestId('partial-failure')).toContainText('CRM coaching tasks')
      await expect(page.getByText('Couldn’t load score thresholds')).toBeVisible()
      const gauge = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Against your thresholds' }) })
      await expect(gauge).not.toContainText('65') // no default target is substituted
      await expect(page.locator('[data-state="partial"]')).toContainText('couldn’t be loaded')
      await expect(page.getByRole('list', { name: 'Weakest skills' })).toBeVisible()
    })

    test('403 on score-trend: a permission state, not raw error text; the rest still works', async ({ page }) => {
      await open(page, { trend: 403 })
      const perm = page.locator('[data-state="permission"]').first()
      await expect(perm).toContainText('You don’t have access to the score trend')
      await expect(perm).toContainText('need a manager role')
      await expect(perm.getByRole('button')).toHaveCount(0)
      const t = await visibleText(page)
      expect(t).not.toMatch(/forbidden|403|boom|error/i)
      await expect(page.getByTestId('partial-failure')).toHaveCount(0)
      await expect(page.getByRole('list', { name: 'Reps needing attention' })).toBeVisible()
      await noOverflow(page)
    })

    test('threshold config absent: says so instead of inventing a target', async ({ page }) => {
      await open(page, { thresholds: 'missing' })
      await expect(page.getByText('Score thresholds aren’t configured')).toBeVisible()
      await expect(page.getByTestId('gauge-marker')).toHaveCount(0)
      await expect(page.locator('.recharts-reference-line')).toHaveCount(0)
    })

    test('period: default 365; 30/90 persist in the URL and reload; invalid falls back', async ({ page }) => {
      const requests: string[] = []
      await open(page, { requests })
      await expect(page.getByRole('button', { name: '365 days' })).toHaveAttribute('aria-pressed', 'true')
      expect(requests.some((r) => r.includes('score-trend?days=365'))).toBe(true)
      expect(requests.some((r) => r.includes('command-centre?days=365'))).toBe(true)

      await page.getByRole('button', { name: '30 days' }).click()
      await expect(page).toHaveURL(/days=30/)
      await expect(page.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true')
      await expect.poll(() => requests.some((r) => r.includes('score-trend?days=30'))).toBe(true)
      expect(requests.some((r) => r.includes('command-centre?days=30'))).toBe(true)
      await expect(page.getByTestId('data-window')).toContainText('in the last 30 days')

      await page.reload()
      await expect(page.getByRole('heading', { name: 'Score trend' })).toBeVisible({ timeout: 20000 })
      await expect(page.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true')

      await page.getByRole('button', { name: '90 days' }).click()
      await expect(page).toHaveURL(/days=90/)
      await page.getByRole('button', { name: '365 days' }).click()
      await expect(page).not.toHaveURL(/days=/)
      await page.goto('/crm/analytics?days=7')
      await expect(page.getByRole('button', { name: '365 days' })).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByRole('button', { name: '7 days' })).toHaveCount(0)
    })

    test('rep filter: persists in the URL, re-queries the trend, keeps team-wide sections labelled', async ({ page }) => {
      const requests: string[] = []
      await open(page, { requests, repTrend: [{ date: TREND_FULL[5].date, avg_score: 90, count: 1 }, { date: TREND_FULL[4].date, avg_score: 70, count: 3 }] })
      await page.getByLabel('Filter by rep').selectOption(R1)
      await expect(page).toHaveURL(new RegExp(`rep=${R1}`))
      await expect.poll(() => requests.some((r) => r.includes('score-trend') && r.includes(`repId=${R1}`))).toBe(true)
      await expect(page.getByText(/Filtered to Alex Johnson/)).toBeVisible()
      // the rep's own call-weighted average (80·0.. = (90*1+70*3)/4 = 75) and sample
      const text = await visibleText(page)
      expect(text).toMatch(/Average score\s*\n?\s*75/)
      expect(text).toMatch(/Scored calls\s*\n?\s*4/)
      await page.reload()
      await expect(page.getByLabel('Filter by rep')).toHaveValue(R1)
    })

    test('keyboard: controls are reachable and operable without a mouse', async ({ page }) => {
      await open(page)
      const thirty = page.getByRole('button', { name: '30 days' })
      await thirty.focus()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(/days=30/)
      await page.getByRole('button', { name: '90 days' }).focus()
      await page.keyboard.press('Space')
      await expect(page).toHaveURL(/days=90/)
      await page.getByLabel('Filter by rep').focus()
      await page.keyboard.type('Sam')
      await expect(page.getByLabel('Filter by rep')).toHaveValue(R2)
      await expect(page).toHaveURL(new RegExp(`rep=${R2}`))
      const summary = page.locator('summary', { hasText: 'View as table' })
      await summary.focus()
      await page.keyboard.press('Enter')
      await expect(page.locator('details:has(> summary:has-text("View as table"))')).toHaveAttribute('open', '')
      // visible focus ring on a period button (ds-focus → 2px outline)
      await page.getByRole('button', { name: '365 days' }).focus()
      const outline = await page.getByRole('button', { name: '365 days' }).evaluate((el) => getComputedStyle(el).outlineStyle)
      expect(outline).not.toBe('none')
    })

    test('exports: CSV matches the displayed points and includes sample sizes', async ({ page }) => {
      await open(page)
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()])
      expect(download.suggestedFilename()).toBe('score-trend.csv')
      const csv = (await (await import('node:fs/promises')).readFile((await download.path())!, 'utf8')).trim().split('\n')
      expect(csv[0]).toBe('date,avg_score,scored_calls')
      expect(csv).toHaveLength(1 + TREND_FULL.length)
      expect(csv[1]).toContain('"60"')
      expect(csv[1]).toContain('"2"')
    })
  })
}
