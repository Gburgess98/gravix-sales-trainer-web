import { test, expect } from '@playwright/test'
import { goto } from '../helpers/navigation'
import { expectShellVisible, expectNoPageCrash } from '../helpers/shell'

/**
 * Call review page tests.
 *
 * Note: /calls/[id] uses AuthGate — unauthenticated access redirects to /login.
 * For structural tests we verify the redirect behaviour.
 * The call library (call-library) has no AuthGate and can be tested fully.
 */

const MOCK_CALL_ID = 'test-call-123'

test.describe('Call review auth protection', () => {
  test('unauthenticated /calls/[id] redirects to /login', async ({ page }) => {
    await page.goto(`/calls/${MOCK_CALL_ID}`, { waitUntil: 'domcontentloaded' })
    // AuthGate should redirect to /login when there is no Supabase session
    await expect(page).toHaveURL(/\/login/, { timeout: 8000 })
  })
})

test.describe('Call Library page', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('/api/proxy/v1/calls/paged*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          calls: [
            {
              id: 'call-lib-1',
              filename: 'weekly-standup-call.mp3',
              score_overall: 74,
              created_at: new Date().toISOString(),
              rep_name: 'Alex Johnson',
              status: 'reviewed',
              flags: [],
            },
            {
              id: 'call-lib-2',
              filename: 'prospect-discovery.mp3',
              score_overall: 48,
              created_at: new Date().toISOString(),
              rep_name: 'Sam Rivera',
              status: 'reviewed',
              flags: ['weak_close'],
            },
          ],
          total: 2,
          page: 1,
          per_page: 50,
        }),
      })
    })
    await page.route('/api/proxy/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })
    await goto(page, '/call-library')
  })

  test('shell renders on call library', async ({ page }) => {
    await expectShellVisible(page)
    await expectNoPageCrash(page)
  })

  test('call library heading is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /calls/i }).first()).toBeVisible({ timeout: 8000 })
  })

  test('call filenames appear in the list', async ({ page }) => {
    await expect(page.getByText('weekly-standup-call.mp3')).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('prospect-discovery.mp3')).toBeVisible()
  })

  test('flagged badge appears for flagged call', async ({ page }) => {
    await expect(page.getByText(/flagged/i).first()).toBeVisible({ timeout: 6000 })
  })

  test('review links are present', async ({ page }) => {
    await expect(page.getByRole('link', { name: /review/i }).first()).toBeVisible({ timeout: 6000 })
  })

  test('no crash on page load', async ({ page }) => {
    await expectNoPageCrash(page)
  })
})

test.describe('Call Library navigation', () => {
  test('review link points to /calls/[id]', async ({ page }) => {
    await page.route('/api/proxy/v1/calls/paged*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          calls: [
            {
              id: 'nav-call-1',
              filename: 'test-call.mp3',
              score_overall: 65,
              created_at: new Date().toISOString(),
              rep_name: 'Alex Johnson',
              status: 'reviewed',
              flags: [],
            },
          ],
          total: 1,
        }),
      })
    })
    await page.route('/api/proxy/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
    })
    await goto(page, '/call-library')

    const reviewLink = page.getByRole('link', { name: /review/i }).first()
    await expect(reviewLink).toBeVisible({ timeout: 6000 })
    const href = await reviewLink.getAttribute('href')
    expect(href).toMatch(/\/calls\//)
  })
})
