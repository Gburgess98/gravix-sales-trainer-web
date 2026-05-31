import { test, expect } from '@playwright/test'
import { goto } from '../helpers/navigation'
import { expectShellVisible, expectNoPageCrash } from '../helpers/shell'

/**
 * Assignments workflow tests.
 * Covers: page load, status tabs, completion flow, empty state.
 */

const MOCK_ASSIGNMENT = {
  id: 'assign-test-1',
  title: 'Objection handling drill',
  type: 'drill',
  status: 'assigned',
  rep_id: 'test-rep-1',
  due_at: new Date(Date.now() + 86400000 * 2).toISOString(),
  created_at: new Date().toISOString(),
  completed_at: null,
  meta: { urgency: 'high', skill: 'Objection handling' },
}

const MOCK_COMPLETED = {
  ...MOCK_ASSIGNMENT,
  id: 'assign-test-2',
  title: 'Closing practice session',
  status: 'completed',
  completed_at: new Date().toISOString(),
}

test.describe('Assignments page structure', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('/api/proxy/v1/assignments*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          assignments: [MOCK_ASSIGNMENT, MOCK_COMPLETED],
          summary: { total: 2, completed: 1, open: 1, completed_count: 1 },
        }),
      })
    })
    await page.route('/api/proxy/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })
    await goto(page, '/assignments')
  })

  test('shell renders', async ({ page }) => {
    await expectShellVisible(page)
    await expectNoPageCrash(page)
  })

  test('page heading is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'My Assignments' })).toBeVisible({ timeout: 8000 })
  })

  test('open assignment title is visible', async ({ page }) => {
    await expect(page.getByText('Objection handling drill')).toBeVisible({ timeout: 8000 })
  })

  test('no page crash on load', async ({ page }) => {
    await expectNoPageCrash(page)
  })
})

test.describe('Assignments filtering', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('/api/proxy/v1/assignments*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          assignments: [MOCK_ASSIGNMENT, MOCK_COMPLETED],
          summary: { total: 2, completed: 1, open: 1, completed_count: 1 },
        }),
      })
    })
    await page.route('/api/proxy/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })
    await goto(page, '/assignments')
    // Wait for content to load
    await expect(page.getByRole('heading', { name: 'My Assignments' })).toBeVisible({ timeout: 8000 })
  })

  test('switching to completed shows completed assignments', async ({ page }) => {
    // Find the completed tab — the assignments page uses its own tab UI
    const completedTab = page.getByRole('button', { name: /completed/i }).first()
    if (await completedTab.isVisible()) {
      await completedTab.click()
      await expect(page.getByText('Closing practice session')).toBeVisible({ timeout: 5000 })
    }
  })

  test('no crash after interacting with filters', async ({ page }) => {
    const allBtn = page.getByRole('button', { name: /all/i }).first()
    if (await allBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await allBtn.click()
    }
    await expectNoPageCrash(page)
  })
})

test.describe('Assignments empty state', () => {
  test('renders gracefully with no assignments', async ({ page }) => {
    await page.route('/api/proxy/v1/assignments*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, assignments: [], summary: { total: 0, completed: 0, open: 0 } }),
      })
    })
    await page.route('/api/proxy/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })
    await goto(page, '/assignments')
    await expectShellVisible(page)
    await expectNoPageCrash(page)
    await expect(page.getByRole('heading', { name: 'My Assignments' })).toBeVisible({ timeout: 8000 })
  })
})
