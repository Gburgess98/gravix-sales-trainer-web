import { test, expect, Page } from '@playwright/test'
import {
  fakeRepSession, mockRepApi, REP_UID, MANAGER_UID,
  TRENDS_IMPROVING, TRENDS_DECLINING, TRENDS_OLD_ONLY, TRENDS_NONE, type RepApiOpts,
} from '../helpers/glass-fixtures'

/**
 * Glass system — rep Progress (/progress). Fully mocked REP session (manager endpoints answer 403).
 * Proves the UI against the live endpoint shapes; it is NOT real-data verification.
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

const summary = (page: Page) => page.getByRole('region', { name: 'Progress summary' })

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} ${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test('improving: honest summary, labelled comparison, skills, next action, completed, secondary points', async ({ page }) => {
      const errors = trackConsole(page)
      const otherIdCalls: string[] = []
      const voiceUrls: string[] = []
      await setup(page, { otherIdCalls, voiceUrls })
      await page.goto('/progress')
      await expect(page.getByRole('heading', { name: 'Progress', level: 1 })).toBeVisible({ timeout: 15000 })
      const s = summary(page)
      await expect(s).toContainText('Your call score is up 12 points', { timeout: 15000 })
      await expect(s).toContainText('Last 30 days: average 74 from 4 calls · previous 30 days: 62 from 4 calls')
      await expect(s).toContainText('▲ 12 pts vs previous 30 days')
      // the unscored call (overall 0) is not counted as a score
      await expect(s).not.toContainText('5 calls')
      await expect(s).toContainText('Voice score, daily average: 76')
      await expect(page.getByRole('img', { name: /Call scores over the last 30 days/ })).toBeVisible()
      // skills from real stage series
      const skills = page.getByRole('list', { name: 'Skills' }).getByRole('listitem')
      await expect(skills).toHaveCount(4)
      await expect(skills.filter({ hasText: 'Intro' })).toContainText('Strongest')
      await expect(skills.filter({ hasText: 'Intro' })).toContainText('+9 vs previous 30 days')
      await expect(skills.filter({ hasText: 'Objection handling' })).toContainText('Weakest')
      await expect(skills.filter({ hasText: 'Objection handling' })).toContainText('-6 vs previous 30 days')
      // next action ties the weakest skill to real things: a suggested call, practice, assignments
      await expect(page.getByText('Objection handling is your lowest-scoring skill (51) over the last 30 days.')).toBeVisible()
      await expect(page.getByText('Suggested drill, rule-based from your latest call: Budget objection drill')).toBeVisible()
      await expect(page.getByRole('link', { name: 'Review a recent call (scored 49)' })).toHaveAttribute('href', '/calls/c-77')
      await expect(page.getByRole('link', { name: 'Practise in Sparring' })).toHaveAttribute('href', '/call-library?tab=sparring')
      await expect(page.getByRole('link', { name: 'Your assignments (5 open)' })).toHaveAttribute('href', '/assignments')
      // recent completed, evidence only when the row carries it
      const done = page.getByRole('list', { name: 'Recently completed' }).getByRole('listitem')
      await expect(done).toHaveCount(3)
      await expect(done.nth(0)).toContainText('Pricing pushback drill')
      await expect(done.nth(0)).toContainText('Completed from a matched sparring session · score 81%')
      await expect(done.nth(1)).not.toContainText('score')
      // gamification is present but secondary and labelled
      await expect(page.getByText('1,240')).toBeVisible()
      await expect(page.getByText('from your account', { exact: true })).toBeVisible() // total only: no per-day points exist, so none is invented
      await expect(page.getByText('today ·', { exact: false })).toHaveCount(0)
      await expect(page.getByText('Advanced III')).toBeVisible()
      await expect(page.getByText('calculated from points')).toBeVisible()
      await expect(page.getByText('consecutive days with a completed assignment')).toBeVisible()
      // own data only: no rankings, no other ids, voice request scoped to self
      const text = await page.locator('main').innerText()
      expect(text).not.toMatch(UUID)
      for (const banned of ['Leaderboard', 'Rank #', 'Team average', 'Create assignment']) expect(text).not.toContain(banned)
      expect(otherIdCalls, 'requests naming another id').toEqual([])
      expect(voiceUrls.length).toBeGreaterThan(0)
      for (const u of voiceUrls) expect(u).toContain(`repId=${REP_UID}`)
      expect(text).not.toContain(MANAGER_UID)
      await page.screenshot({ path: `test-results/glass/rep-progress-improving-${vp.name}.png`, fullPage: true })
      await noHorizontalOverflow(page)
      expect(errors).toEqual([])
    })

    test('declining: says so plainly', async ({ page }) => {
      await setup(page, { trends: TRENDS_DECLINING })
      await page.goto('/progress')
      const s = summary(page)
      await expect(s).toContainText('Your call score is down 16 points', { timeout: 15000 })
      await expect(s).toContainText('▼ 16 pts vs previous 30 days')
      await page.screenshot({ path: `test-results/glass/rep-progress-declining-${vp.name}.png`, fullPage: true })
      await noHorizontalOverflow(page)
    })

    test('new user: no invented trend, strongest/weakest or completion; clear first steps', async ({ page }) => {
      await setup(page, { trends: TRENDS_NONE, assignments: [], feed: null, xp: { total_xp: 0 } })
      await page.goto('/progress')
      const s = summary(page)
      await expect(s).toContainText('No scored calls yet', { timeout: 15000 })
      await expect(s.getByRole('link', { name: 'Upload a call' })).toHaveAttribute('href', '/upload')
      await expect(page.getByText('No scored stages in the last 30 days.')).toBeVisible()
      await expect(page.getByText('Strongest', { exact: true })).toHaveCount(0)
      await expect(page.getByText('Weakest', { exact: true })).toHaveCount(0)
      await expect(page.getByText('Nothing completed yet. Your finished coaching work will appear here.')).toBeVisible()
      await expect(page.getByRole('img', { name: /Call scores/ })).toHaveCount(0)
      await expect(page.getByText('Foundation')).toBeVisible()
      await page.screenshot({ path: `test-results/glass/rep-progress-new-${vp.name}.png`, fullPage: true })
      await noHorizontalOverflow(page)
    })

    test('no recent history: older calls only is not described as "never scored"', async ({ page }) => {
      await setup(page, { trends: TRENDS_OLD_ONLY })
      await page.goto('/progress')
      await expect(summary(page)).toContainText('No scored calls in the last 30 days', { timeout: 15000 })
      await expect(summary(page)).not.toContainText('No scored calls yet')
      await noHorizontalOverflow(page)
    })

    test('points: requests the real endpoint (/v1/reps/<self>/xp), never /v1/assignments/me, and renders only its total', async ({ page }) => {
      const urls: string[] = []
      page.on('request', (r) => { if (r.url().includes('/api/proxy/')) urls.push(new URL(r.url()).pathname.replace('/api/proxy', '')) })
      await setup(page, { xp: { total_xp: 1240 } })
      await page.goto('/progress')
      await expect(page.getByText('1,240')).toBeVisible({ timeout: 15000 })
      await expect.poll(() => urls.filter((u) => u === `/v1/reps/${REP_UID}/xp`).length).toBeGreaterThan(0) // (dev StrictMode may run the loader twice)
      expect(urls.filter((u) => u.includes('/v1/assignments/me'))).toEqual([])
      await expect(page.getByText('today ·', { exact: false })).toHaveCount(0)
    })

    test('points: the API\u2019s tolerant warning answer reads as unavailable, never as zero points', async ({ page }) => {
      await setup(page, { xp: { total_xp: 0, warning: 'relation "xp_events" does not exist' } })
      await page.goto('/progress')
      await expect(summary(page)).toContainText('Your call score is up', { timeout: 15000 })
      await expect(page.getByText('unavailable right now').first()).toBeVisible()
      await expect(page.getByText('Foundation')).toHaveCount(0) // the level is only shown when points are known
      expect(await page.locator('body').innerText()).not.toContain('relation')
    })

    test('partial errors: sections fail independently with a retry', async ({ page }) => {
      await setup(page, { trendsStatus: 500, xpStatus: 500 })
      await page.goto('/progress')
      await expect(page.getByText('Your score history is unavailable right now.')).toBeVisible({ timeout: 15000 })
      await expect(page.getByText('Skill scoring is unavailable right now.')).toBeVisible()
      // assignments still work
      await expect(page.getByRole('list', { name: 'Recently completed' }).getByRole('listitem')).toHaveCount(3)
      await expect(page.getByText('unavailable right now').first()).toBeVisible()
      await expect(page.getByText('Advanced III')).toHaveCount(0)
      await page.screenshot({ path: `test-results/glass/rep-progress-partial-${vp.name}.png`, fullPage: true })
      await noHorizontalOverflow(page)
    })

    test('full error: calm message and retry recovers', async ({ page }) => {
      await setup(page, { meStatus: 500 })
      await page.goto('/progress')
      const alert = page.getByRole('alert').filter({ hasText: 'Couldn’t load your progress' })
      await expect(alert).toBeVisible({ timeout: 15000 })
      await page.unroute('**/api/proxy/**')
      await setup(page)
      await alert.getByRole('button', { name: 'Try again' }).click()
      await expect(summary(page)).toContainText('Your call score is up', { timeout: 15000 })
    })
  })
}

test.describe('interaction (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('loading state is announced', async ({ page }) => {
    await setup(page)
    await page.route('**/api/proxy/v1/assignments', async (route) => { await new Promise((r) => setTimeout(r, 1200)); await route.fallback() })
    await page.goto('/progress')
    await expect(page.getByRole('status', { name: 'Loading your progress' })).toBeVisible({ timeout: 10000 })
    await expect(summary(page)).toContainText('Your call score is up', { timeout: 15000 })
  })

  test('90-day range: relabels everything, drops the comparison it cannot make, survives reload', async ({ page }) => {
    const voiceUrls: string[] = []
    await setup(page, { voiceUrls })
    await page.goto('/progress')
    await expect(summary(page)).toContainText('Your call score is up 12 points', { timeout: 15000 })
    await page.getByRole('button', { name: '90 days' }).click()
    await expect(page).toHaveURL(/range=90/)
    await expect(page.getByRole('button', { name: '90 days' })).toHaveAttribute('aria-pressed', 'true')
    const s = summary(page)
    await expect(s).toContainText('Average call score 68')
    await expect(s).toContainText('no scored calls in the previous 90 days to compare')
    await expect(s).not.toContainText('pts vs previous')
    await expect(page.getByText('over the last 90 days', { exact: false }).first()).toBeVisible()
    await expect.poll(() => voiceUrls.some((u) => u.includes('days=90'))).toBe(true)
    await page.reload()
    await expect(page.getByRole('button', { name: '90 days' })).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 })
    await page.getByRole('button', { name: '30 days' }).click()
    await expect(page).not.toHaveURL(/range=/)
  })

  test('history over the API limit says older calls are not included', async ({ page }) => {
    const many = Array.from({ length: 100 }, (_, i) => ({ date: new Date(Date.now() - (i % 25) * 86_400_000).toISOString(), value: 70 }))
    await setup(page, { trends: { ...TRENDS_IMPROVING, overall: many } })
    await page.goto('/progress')
    await expect(page.getByText('older calls are not included')).toBeVisible({ timeout: 15000 })
  })

  test('next-action link: keyboard focus ring, Enter opens the call, back/forward keep the range', async ({ page }) => {
    await setup(page)
    await page.goto('/progress')
    await expect(summary(page)).toContainText('Your call score is up', { timeout: 15000 })
    await page.getByRole('button', { name: '90 days' }).click()
    const link = page.getByRole('link', { name: /Review a recent call/ })
    await page.getByRole('button', { name: '90 days' }).focus()
    for (let i = 0; i < 25 && !(await link.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab')
    await expect(link).toBeFocused()
    const ring = await link.evaluate((el) => { const s = getComputedStyle(el); return `${s.outlineStyle} ${s.boxShadow}` })
    expect(ring).not.toMatch(/^none none$/)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/calls\/c-77$/)
    await page.goBack()
    await expect(page).toHaveURL(/\/progress\?range=90/)
    await expect(page.getByRole('button', { name: '90 days' })).toHaveAttribute('aria-pressed', 'true', { timeout: 15000 })
    await page.goForward()
    await expect(page).toHaveURL(/\/calls\/c-77$/)
    // other links
    await page.goto('/progress')
    await expect(page.getByRole('link', { name: 'All completed' })).toHaveAttribute('href', '/assignments?view=completed', { timeout: 15000 })
  })

  test('rep nav: Progress is the active destination; My Assignments links to it', async ({ page }) => {
    await setup(page)
    await page.goto('/progress')
    const aside = page.locator('aside').first()
    await expect(aside.getByRole('link', { name: 'Progress', exact: true })).toBeVisible({ timeout: 15000 })
    await page.goto('/assignments')
    await expect(page.getByRole('link', { name: 'Your progress' })).toHaveAttribute('href', '/progress', { timeout: 15000 })
  })
})
