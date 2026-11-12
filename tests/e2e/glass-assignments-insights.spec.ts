import { test, expect, Page } from '@playwright/test'
import { fakeManagerSession } from '../helpers/glass-fixtures'

/**
 * Glass system — manager Assignments (/coaching?tab=assignments) and Insights (/crm/analytics).
 * Fully mocked (fake local session, mocked /api/proxy, Supabase sockets/hosts blocked). Not real-data verification.
 */

const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()
const ROSTER = [
  { id: 'r1', name: 'Alex Johnson', email: 'alex@example.test' },
  { id: 'r2', name: 'Sam Rivera', email: 'sam@example.test' },
  { id: 'r3', name: '', email: 'priya.nair@example.test' },
]
const ASSIGNMENTS = [
  { id: 'a1', rep_id: 'r1', title: 'Objection handling drill', type: 'drill', status: 'open', due_at: day(-2), created_at: day(-9), meta: { coaching_notes: 'Anchor on ROI before price.' } },
  { id: 'a2', rep_id: 'r2', title: 'Closing practice', type: 'sparring', status: 'open', due_at: day(3), created_at: day(-3), source: 'manager_review', meta: { source_call_id: 'c1' } },
  { id: 'a3', rep_id: 'r1', title: 'Budget sparring', type: 'sparring', status: 'completed', due_at: day(-5), completed_at: day(-4), created_at: day(-12), meta: { completed_via: 'sparring_session_match', completion_score: 82 } },
  { id: 'a4', rep_id: 'r3', title: 'Discovery questions', type: 'call_review', status: 'open', created_at: day(-1), target_id: 'c2' },
  { id: 'a5', rep_id: 'r99', title: 'Orphaned rep', type: 'drill', status: 'open', due_at: day(10), created_at: day(-1) },
]
const j = (b: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(b) })

type Opts = { assignments?: unknown[] | 'error'; delay?: number; analytics?: 'ok' | 'empty' | 'error'; patchStatus?: number }

async function setup(page: Page, o: Opts = {}) {
  await fakeManagerSession(page)
  // Never touch Supabase: abort REST/auth traffic and close realtime sockets.
  await page.route(/supabase\.co/, (r) => r.abort())
  await page.routeWebSocket(/supabase\.co/, (ws) => ws.close())
  await page.route('**/api/proxy/**', async (route) => {
    const u = route.request().url()
    const method = route.request().method()
    if (u.includes('/v1/assignments/manager/') && method === 'PATCH') {
      return route.fulfill(o.patchStatus && o.patchStatus !== 200 ? j({ ok: false }, o.patchStatus) : j({ ok: true, item: { id: 'a1', status: 'completed' } }))
    }
    if (u.includes('/v1/assignments/manager')) {
      if (o.delay) await new Promise((r) => setTimeout(r, o.delay))
      if (o.assignments === 'error') return route.fulfill(j({ ok: false, error: 'boom' }, 500))
      return route.fulfill(j({ ok: true, items: o.assignments ?? ASSIGNMENTS }))
    }
    if (u.includes('/v1/team/members')) return route.fulfill(j({ ok: true, items: ROSTER, seats: {}, warnings: [] }))
    if (u.includes('/v1/team/users')) return route.fulfill(j({ ok: true, items: ROSTER }))
    if (u.includes('/v1/manager/command-centre')) {
      return route.fulfill(j({ ok: true, teamHealth: { status: 'amber', averageScore: 66, reviewedCalls: 4, callsNeedingReview: 0, openAssignments: 3, overdueAssignments: 1 }, repsNeedingAttention: [], callsNeedingReview: [], openAssignments: [], weakestSkills: [], coachingImpact: { completedAssignments: 4, skillsImproving: 2, skillsDeclining: 1, summary: '4 drills completed; 2 skills improving, 1 declining.' }, roi: {} }))
    }
    if (u.includes('/v1/crm/analytics/')) {
      if (o.analytics === 'error') return route.abort()
      const empty = o.analytics === 'empty'
      if (u.includes('stage-conversion')) return route.fulfill(j({ ok: true, stages: empty ? {} : { Qualified: 8, Proposal: 5, Won: 2 } }))
      if (u.includes('score-trend')) return route.fulfill(j({ ok: true, trend: empty ? [] : [60, 62, 61, 66, 70, 72].map((v, i) => ({ date: `2026-10-${10 + i}`, avg_score: v })) }))
      if (u.includes('activity-by-rep')) {
        const reps = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'].map((id, i) => ({ rep_id: id, rep_name: id, activities_created: 10 - i, activities_completed: 5 }))
        return route.fulfill(j({ ok: true, reps: empty ? [] : reps }))
      }
    }
    if (u.includes('/v1/admin/config') || u.includes('/v1/reps/me')) return route.fulfill(j({ ok: true, is_manager: true }))
    return route.fulfill(j({ ok: true, items: [], headline: {}, reps_all: [] }))
  })
}

async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 'document overflow').toBeLessThanOrEqual(1)
  const wide = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    return Array.from(document.querySelectorAll('main section, main .ds-panel, main .ds-glass')).filter((e) => e.getBoundingClientRect().right > vw + 1).map((e) => (e.textContent || '').slice(0, 40))
  })
  expect(wide, 'panels wider than viewport').toEqual([])
}

function track(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|hot-update/.test(m.text())) errors.push(m.text()) })
  return errors
}

const VIEWPORTS = [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 375, height: 812 }]

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} ${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test('Assignments: summary, list, roster names, evidence, no overflow, no errors', async ({ page }) => {
      const errors = track(page)
      await setup(page)
      await page.goto('/coaching?tab=assignments')
      const list = page.getByRole('list', { name: 'Assignments' })
      await expect(list).toBeVisible({ timeout: 15000 })
      await expect(list.getByRole('listitem')).toHaveCount(5)
      // summary: open 3 (a2, a4, a5), overdue 1, completed 1
      const dl = page.locator('dl').first()
      await expect(dl).toContainText('Overdue')
      await expect(dl.locator('dd').nth(0)).toHaveText('3')
      await expect(dl.locator('dd').nth(1)).toHaveText('1')
      await expect(dl.locator('dd').nth(2)).toHaveText('1')
      // overdue first; roster names (never ids), email-local fallback, neutral fallback for unknown rep
      await expect(list.getByRole('listitem').first()).toContainText('Objection handling drill')
      await expect(list).toContainText('Alex Johnson')
      await expect(list).toContainText('priya.nair')
      await expect(list.getByRole('listitem').filter({ hasText: 'Orphaned rep' })).toContainText('Team member')
      await expect(list).not.toContainText('r99')
      await expect(list).toContainText('Sparring proof')
      await page.screenshot({ path: `test-results/glass/assignments-${vp.name}.png`, fullPage: true })
      await noOverflow(page)
      expect(errors).toEqual([])
    })

    test('Assignments: search, status, rep, type and due filters; clear', async ({ page }) => {
      await setup(page)
      await page.goto('/coaching?tab=assignments')
      const items = page.getByRole('list', { name: 'Assignments' }).getByRole('listitem')
      await expect(items).toHaveCount(5, { timeout: 15000 })
      await page.getByLabel('Search assignments').fill('sam')
      await expect(items).toHaveCount(1)
      await page.getByLabel('Search assignments').fill('')
      await page.getByRole('button', { name: 'Overdue', exact: true }).click()
      await expect(items).toHaveCount(1)
      await page.getByRole('button', { name: 'All', exact: true }).click()
      await page.getByLabel('Filter by rep').selectOption('r1')
      await expect(items).toHaveCount(2)
      await page.getByLabel('Filter by type').selectOption('sparring')
      await expect(items).toHaveCount(1)
      await expect(page.getByText('Showing 1 of 5')).toBeVisible()
      await page.getByRole('button', { name: 'Clear filters' }).first().click()
      await expect(items).toHaveCount(5)
      await page.getByLabel('Filter by due date').selectOption('none')
      await expect(items).toHaveCount(1)
      await page.getByLabel('Search assignments').fill('zzz-no-match')
      await expect(page.getByText('No assignments match')).toBeVisible()
      await noOverflow(page)
    })

    test('Assignments: inspect (keyboard), mark complete two-step, create link', async ({ page }) => {
      await setup(page)
      await page.goto('/coaching?tab=assignments')
      const first = page.getByRole('list', { name: 'Assignments' }).getByRole('listitem').first()
      await expect(first).toBeVisible({ timeout: 15000 })
      const details = first.getByRole('button', { name: 'Details' })
      await details.focus()
      await page.keyboard.press('Enter')
      await expect(details).toHaveAttribute('aria-expanded', 'true')
      await expect(first).toContainText('Anchor on ROI before price.')
      await expect(first).toContainText('No proof attached yet.')
      await expect(page.getByRole('link', { name: 'Create assignment' })).toHaveAttribute('href', '/admin/assignments/create')
      // two-step completion: nothing is sent until Confirm
      let patched = 0
      page.on('request', (r) => { if (r.method() === 'PATCH' && r.url().includes('/v1/assignments/manager/')) patched += 1 })
      await first.getByRole('button', { name: 'Mark complete' }).click()
      expect(patched).toBe(0)
      await first.getByRole('button', { name: 'Cancel' }).click()
      expect(patched).toBe(0)
      await first.getByRole('button', { name: 'Mark complete' }).click()
      await first.getByRole('button', { name: 'Confirm complete' }).click()
      await expect(page.getByText('Assignment marked complete.')).toBeVisible()
      expect(patched).toBe(1)
    })

    test('Assignments: completion refused by the API shows a clear error', async ({ page }) => {
      await setup(page, { patchStatus: 403 })
      await page.goto('/coaching?tab=assignments')
      const first = page.getByRole('list', { name: 'Assignments' }).getByRole('listitem').first()
      await first.getByRole('button', { name: 'Mark complete' }).click({ timeout: 15000 })
      await first.getByRole('button', { name: 'Confirm complete' }).click()
      await expect(page.getByText('Only the manager who created this assignment can complete it.')).toBeVisible()
    })

    test('Assignments: loading, empty and error states', async ({ page }) => {
      await setup(page, { delay: 1500 })
      await page.goto('/coaching?tab=assignments')
      await expect(page.getByRole('status', { name: 'Loading assignments' })).toBeVisible({ timeout: 10000 })
      await expect(page.getByRole('list', { name: 'Assignments' })).toBeVisible({ timeout: 15000 })

      const empty = await page.context().newPage()
      await setup(empty, { assignments: [] })
      await empty.setViewportSize({ width: vp.width, height: vp.height })
      await empty.goto('/coaching?tab=assignments')
      await expect(empty.getByText('No assignments yet')).toBeVisible({ timeout: 15000 })
      await expect(empty.getByRole('link', { name: 'Create assignment' }).first()).toBeVisible()
      await noOverflow(empty)

      const bad = await page.context().newPage()
      await setup(bad, { assignments: 'error' })
      await bad.setViewportSize({ width: vp.width, height: vp.height })
      await bad.goto('/coaching?tab=assignments')
      await expect(bad.getByRole('alert').filter({ hasText: 'Assignments are temporarily unavailable' })).toBeVisible({ timeout: 15000 })
      await expect(bad.getByRole('button', { name: 'Try again' })).toBeVisible()
    })
  })
}

test.describe('Browser back/forward', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('sidebar Overview → Assignments → Insights, then back and forward restore the right screen', async ({ page }) => {
    const errors = track(page)
    await setup(page)
    await page.goto('/coaching')
    const aside = page.locator('aside').first()
    await expect(aside).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('heading', { name: 'Reps requiring attention' })).toBeVisible({ timeout: 15000 })
    await aside.getByRole('link', { name: 'Assignments', exact: true }).click()
    await expect(page).toHaveURL(/tab=assignments/)
    await expect(page.getByRole('list', { name: 'Assignments' })).toBeVisible({ timeout: 15000 })
    await aside.getByRole('link', { name: 'Insights', exact: true }).click()
    await expect(page).toHaveURL(/\/crm\/analytics/)
    await expect(page.getByRole('heading', { name: 'Score trend' })).toBeVisible({ timeout: 15000 })
    await page.goBack()
    await expect(page).toHaveURL(/tab=assignments/)
    await expect(page.getByRole('list', { name: 'Assignments' })).toBeVisible({ timeout: 15000 })
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'Reps requiring attention' })).toBeVisible({ timeout: 15000 })
    await page.goForward()
    await expect(page.getByRole('list', { name: 'Assignments' })).toBeVisible({ timeout: 15000 })
    expect(errors).toEqual([])
  })

  test('in-page tab switch Overview ↔ Assignments keeps the page working', async ({ page }) => {
    await setup(page)
    await page.goto('/coaching')
    await expect(page.getByRole('heading', { name: 'Reps requiring attention' })).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'Assignments' }).first().click()
    await expect(page.getByRole('list', { name: 'Assignments' })).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: 'Overview' }).first().click()
    await expect(page.getByRole('heading', { name: 'Reps requiring attention' })).toBeVisible()
  })
})
