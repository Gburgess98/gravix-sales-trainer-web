import { test, expect } from '@playwright/test'
import { goto } from '../helpers/navigation'
import { expectShellVisible, expectNoPageCrash, clickTab } from '../helpers/shell'
import { mockAllApiRoutes, MOCK_REP, MOCK_HEADLINE } from '../helpers/mocks'

/**
 * Coaching Command Centre tests (Day 78 AI Manager OS).
 * Covers: overview load, tab switching, intervention queue, filters,
 * coaching plan cards, manager briefing.
 */

test.describe('Coaching page structure', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApiRoutes(page)
    await goto(page, '/coaching')
  })

  test('shell renders', async ({ page }) => {
    await expectShellVisible(page)
    await expectNoPageCrash(page)
  })

  test('page heading is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Command Centre' })).toBeVisible()
  })

  test('all four workspace tabs are visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Overview' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Interventions' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Assignments' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Replay Queue' })).toBeVisible()
  })
})

test.describe('Coaching Overview tab', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApiRoutes(page)
    await goto(page, '/coaching')
  })

  test('AI Manager Briefing banner is visible', async ({ page }) => {
    await expect(page.getByText('AI Manager Briefing')).toBeVisible({ timeout: 8000 })
  })

  test('KPI stat cards render', async ({ page }) => {
    await expect(page.getByText('At Risk')).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('Overdue Actions')).toBeVisible()
    await expect(page.getByText('Critical Today')).toBeVisible()
  })

  test('3-column intelligence section headers are visible', async ({ page }) => {
    await expect(page.getByText('1. Who needs help?')).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('2. What are they bad at?')).toBeVisible()
    await expect(page.getByText('3. Coaching Plans')).toBeVisible()
  })

  test('rep name appears in Who needs help column', async ({ page }) => {
    // MOCK_REP name should appear in the rep cards
    await expect(page.getByText(MOCK_REP.rep_name)).toBeVisible({ timeout: 8000 })
  })

  test('KPI headline values reflect mock data', async ({ page }) => {
    // reps_at_risk: 2 from MOCK_HEADLINE
    const atRiskCard = page.locator('text=At Risk').locator('..').locator('..')
    await expect(page.getByText(String(MOCK_HEADLINE.reps_at_risk))).toBeVisible({ timeout: 8000 })
  })

  test('Coaching Health section renders', async ({ page }) => {
    await expect(page.getByText('Coaching Health')).toBeVisible({ timeout: 8000 })
  })

  test('rep table renders with rep name', async ({ page }) => {
    // The full rep table should show our mock reps
    await expect(page.getByText(MOCK_REP.rep_name).first()).toBeVisible({ timeout: 8000 })
  })

  test('rep filter bar renders', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'All' }).first()).toBeVisible({ timeout: 6000 })
    await expect(page.getByRole('button', { name: 'At Risk' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Watch' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Healthy' })).toBeVisible()
  })

  test('rep filter switches work', async ({ page }) => {
    // Click "At Risk" filter
    const atRiskBtn = page.getByRole('button', { name: 'At Risk' })
    await expect(atRiskBtn).toBeVisible({ timeout: 6000 })
    await atRiskBtn.click()
    // Page should not crash after filter click
    await expectNoPageCrash(page)
  })

  test('coaching plan cards show Drill/Replay/Sparring sections', async ({ page }) => {
    await expect(page.getByText('Drill').first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('Replay').first()).toBeVisible()
    await expect(page.getByText('Sparring').first()).toBeVisible()
  })
})

test.describe('Interventions tab', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApiRoutes(page)
    await goto(page, '/coaching')
    await clickTab(page, 'Interventions')
  })

  test('intervention queue heading is visible', async ({ page }) => {
    await expect(page.getByText('Intervention Priority Queue')).toBeVisible({ timeout: 8000 })
  })

  test('priority queue table renders with column headers', async ({ page }) => {
    await expect(page.getByText('Urgency')).toBeVisible({ timeout: 6000 })
    await expect(page.getByText('Compliance')).toBeVisible()
    await expect(page.getByText('Outcome')).toBeVisible()
    await expect(page.getByText('Engagement')).toBeVisible()
  })

  test('rep name appears in intervention queue', async ({ page }) => {
    await expect(page.getByText(MOCK_REP.rep_name)).toBeVisible({ timeout: 8000 })
  })

  test('rep rows have action buttons', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Actions' }).first()).toBeVisible({ timeout: 6000 })
    await expect(page.getByRole('link', { name: 'Assign' }).first()).toBeVisible()
  })

  test('urgency state is shown for at-risk rep', async ({ page }) => {
    // MOCK_REP has overdue: 1 + critical_calls: 1 → should be 'Critical'
    await expect(page.getByText('Critical').first()).toBeVisible({ timeout: 6000 })
  })
})

test.describe('Assignments tab', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApiRoutes(page)
    await goto(page, '/coaching')
    await clickTab(page, 'Assignments')
  })

  test('assignment titles are visible', async ({ page }) => {
    await expect(page.getByText('Objection handling drill')).toBeVisible({ timeout: 8000 })
  })

  test('filter bar renders', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Open' }).first()).toBeVisible({ timeout: 6000 })
    await expect(page.getByRole('button', { name: 'Overdue' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'All' })).toBeVisible()
  })

  test('filter switching works', async ({ page }) => {
    await page.getByRole('button', { name: 'All' }).click()
    await expectNoPageCrash(page)
    // Both assignments should now show (open + overdue)
    await expect(page.getByText('Closing practice')).toBeVisible({ timeout: 5000 })
  })

  test('Full Assignment Manager link is present', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Full Assignment Manager/i })).toBeVisible()
  })
})

test.describe('Replay Queue tab', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApiRoutes(page)
    await goto(page, '/coaching')
    await clickTab(page, 'Replay Queue')
  })

  test('call items render', async ({ page }) => {
    await expect(page.getByText('prospect-call-2024-01.mp3')).toBeVisible({ timeout: 8000 })
  })

  test('threshold filter bar renders', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Below 70' })).toBeVisible({ timeout: 6000 })
    await expect(page.getByRole('button', { name: 'Below 60' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Below 50' })).toBeVisible()
  })

  test('score threshold filter switches work', async ({ page }) => {
    await page.getByRole('button', { name: 'Below 60' }).click()
    await expectNoPageCrash(page)
    // score 52 is below 60 → should still show
    await expect(page.getByText('prospect-call-2024-01.mp3')).toBeVisible({ timeout: 5000 })
  })

  test('review links are present', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Review/i }).first()).toBeVisible({ timeout: 6000 })
  })

  test('Full Call Library link is present', async ({ page }) => {
    await expect(page.getByRole('link', { name: /Full Call Library/i })).toBeVisible()
  })
})
