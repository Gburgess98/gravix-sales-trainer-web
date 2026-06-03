import { test, expect } from '@playwright/test'
import { goto } from '../helpers/navigation'
import { expectShellVisible, expectNoPageCrash } from '../helpers/shell'

/**
 * Call review page tests.
 * Route mocks: register catch-all FIRST then specific LAST (Playwright LIFO — last wins).
 *
 * Note: /calls/[id] uses AuthGate — unauthenticated access redirects to /login.
 */

const MOCK_CALL_ID = 'test-call-123'

const MOCK_CALLS_DATA = [
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
]

async function setupCallLibraryMocks(page: import('@playwright/test').Page, calls = MOCK_CALLS_DATA) {
  // Catch-all FIRST (lower priority in Playwright LIFO)
  await page.route('**/api/proxy/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) })
  })
  // Specific LAST (higher priority — wins in LIFO)
  await page.route('**/api/proxy/v1/calls/paged**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, calls, total: calls.length, page: 1, per_page: 50 }),
    })
  })
}

test.describe('Call review auth protection', () => {
  test('unauthenticated /calls/[id] redirects to /login', async ({ page }) => {
    await page.goto(`/calls/${MOCK_CALL_ID}`, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/login/, { timeout: 8000 })
  })
})

test.describe('Call Library page', () => {
  test.beforeEach(async ({ page }) => {
    await setupCallLibraryMocks(page)
    await goto(page, '/call-library')
  })

  test('shell renders on call library', async ({ page }) => {
    await expectShellVisible(page)
    await expectNoPageCrash(page)
  })

  test('call library heading is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Call Library' })).toBeVisible({ timeout: 8000 })
  })

  test('call filenames appear in the list', async ({ page }) => {
    await expect(page.getByText('weekly-standup-call.mp3')).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('prospect-discovery.mp3')).toBeVisible()
  })

  test('needs-review badge appears for flagged/low-score call', async ({ page }) => {
    // Call library shows "Needs Review" for calls with flags or score < 65
    await expect(page.getByText(/needs review/i).first()).toBeVisible({ timeout: 6000 })
  })

  test('review links are present', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Open' }).first()).toBeVisible({ timeout: 6000 })
  })

  test('no crash on page load', async ({ page }) => {
    await expectNoPageCrash(page)
  })
})

test.describe('Call Library navigation', () => {
  test('review link points to /calls/[id]', async ({ page }) => {
    setupCallLibraryMocks(page, [
      {
        id: 'nav-call-1',
        filename: 'test-call.mp3',
        score_overall: 65,
        created_at: new Date().toISOString(),
        rep_name: 'Alex Johnson',
        status: 'reviewed',
        flags: [],
      },
    ])
    await goto(page, '/call-library')

    const callLink = page.getByRole('link', { name: 'Open' }).first()
    await expect(callLink).toBeVisible({ timeout: 6000 })
    const href = await callLink.getAttribute('href')
    expect(href).toMatch(/\/calls\//)
  })
})
