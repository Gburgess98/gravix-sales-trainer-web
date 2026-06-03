import { test, expect } from '@playwright/test'
import { mockAllApiRoutes } from '../helpers/mocks'
import { expectShellVisible, expectNoPageCrash } from '../helpers/shell'

/**
 * Smoke test suite — fast, broad coverage.
 *
 * Each test verifies a route:
 *   1. Does not return a 404 / Next.js "page not found" error
 *   2. Does not crash with a runtime error overlay
 *   3. Renders the correct layout (shell vs legacy)
 *
 * These tests are intentionally shallow. Run them after every deploy
 * to catch broken routes and rendering regressions.
 */

const SHELL_ROUTES = [
  { path: '/dashboard', name: 'Dashboard' },
  { path: '/coaching', name: 'Coaching Command Centre' },
  { path: '/call-library', name: 'Call Library' },
  { path: '/assignments', name: 'Assignments' },
  { path: '/crm/accounts', name: 'CRM Accounts' },
  { path: '/crm/actions', name: 'CRM Actions' },
  { path: '/reps', name: 'Reps list' },
]

test.describe('Smoke: shell routes render without crash', () => {
  for (const { path, name } of SHELL_ROUTES) {
    test(`${name} (${path})`, async ({ page }) => {
      await mockAllApiRoutes(page)
      await page.goto(path, { waitUntil: 'domcontentloaded' })
      await expectShellVisible(page)
      await expectNoPageCrash(page)
    })
  }
})

test.describe('Smoke: login page renders', () => {
  test('/login renders without shell', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    // Login uses legacy layout (no sidebar)
    await expect(page.locator('aside')).not.toBeVisible()
    await expect(page.getByText('Application error')).not.toBeVisible()
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible({ timeout: 8000 })
  })
})

test.describe('Smoke: 404 handling', () => {
  test('unknown route returns not-found page (no crash)', async ({ page }) => {
    await mockAllApiRoutes(page)
    const res = await page.goto('/this-route-does-not-exist-12345')
    // Next.js returns 404 for unknown routes
    expect(res?.status()).toBe(404)
    // Should not crash with an unhandled error
    await expect(page.getByText('Application error')).not.toBeVisible()
  })
})

test.describe('Smoke: API proxy health', () => {
  test('/api/proxy returns a structured response (not raw 500)', async ({ page }) => {
    // The proxy should handle missing routes gracefully (404 or structured error)
    // rather than crashing the server with an unhandled exception
    const res = await page.request.get('/api/proxy/v1/health')
    // Acceptable: 200, 404, 401, 502 (backend down) — NOT 500 (server crash)
    expect(res.status()).not.toBe(500)
  })
})

test.describe('Smoke: auth protection', () => {
  test('/calls/[id] redirects unauthenticated users to /login', async ({ page }) => {
    await page.goto('/calls/smoke-test-call-id', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/login/, { timeout: 8000 })
  })
})

test.describe('Smoke: coaching workflow critical path', () => {
  test('coaching overview loads and shows key sections', async ({ page }) => {
    await mockAllApiRoutes(page)
    await page.goto('/coaching', { waitUntil: 'domcontentloaded' })
    await expectShellVisible(page)
    await expectNoPageCrash(page)
    await expect(page.getByRole('heading', { name: 'Command Centre' })).toBeVisible({ timeout: 8000 })
    await expect(page.getByRole('button', { name: 'Overview' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Interventions' })).toBeVisible()
  })

  test('interventions tab opens without crash', async ({ page }) => {
    await mockAllApiRoutes(page)
    await page.goto('/coaching', { waitUntil: 'domcontentloaded' })
    // Wait for overview data to hydrate before switching tabs
    await expect(page.getByText('AI Manager Briefing')).toBeVisible({ timeout: 8000 })
    await page.getByRole('button', { name: 'Interventions' }).click()
    await expectNoPageCrash(page)
    await expect(page.getByText('Intervention Priority Queue')).toBeVisible({ timeout: 8000 })
  })

  test('assignments tab opens without crash', async ({ page }) => {
    await mockAllApiRoutes(page)
    await page.goto('/coaching', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Assignments' }).click()
    await expectNoPageCrash(page)
  })
})

test.describe('Smoke: CRM critical path', () => {
  test('accounts page loads', async ({ page }) => {
    await mockAllApiRoutes(page)
    await page.goto('/crm/accounts', { waitUntil: 'domcontentloaded' })
    await expectShellVisible(page)
    await expectNoPageCrash(page)
  })

  test('actions page without repId shows empty state prompt', async ({ page }) => {
    await mockAllApiRoutes(page)
    await page.goto('/crm/actions', { waitUntil: 'domcontentloaded' })
    await expectShellVisible(page)
    await expectNoPageCrash(page)
    await expect(page.getByText(/select a rep/i)).toBeVisible({ timeout: 8000 })
  })
})
