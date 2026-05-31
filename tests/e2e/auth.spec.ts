import { test, expect } from '@playwright/test'
import { goto } from '../helpers/navigation'

/**
 * Auth flow tests.
 *
 * The app uses Supabase Google OAuth — there is no email/password login.
 * These tests cover:
 *   - Login page renders correctly
 *   - Unauthenticated access to protected routes redirects to /login
 *   - Shell paths render without a forced auth redirect (no AuthGate on most pages)
 */

test.describe('Login page', () => {
  test('renders the login page', async ({ page }) => {
    await goto(page, '/login')
    await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible()
  })

  test('login page has no runtime crash', async ({ page }) => {
    await goto(page, '/login')
    // No Next.js error overlay
    await expect(page.getByText('Application error')).not.toBeVisible()
  })
})

test.describe('Protected route redirect', () => {
  test('unauthenticated /calls/[id] redirects to /login', async ({ page }) => {
    // /calls/[id] wraps its content in <AuthGate>, which redirects when no session
    await page.goto('/calls/nonexistent-test-id', { waitUntil: 'domcontentloaded' })
    // Wait up to 8s for the client-side redirect to fire
    await expect(page).toHaveURL(/\/login/, { timeout: 8000 })
  })
})

test.describe('Shell paths render without auth redirect', () => {
  // These pages do NOT use AuthGate — they render their shell even when unauthenticated
  // (data sections show loading/error state, but the shell renders)
  const openShellPaths = ['/coaching', '/crm/accounts', '/call-library', '/assignments']

  for (const path of openShellPaths) {
    test(`${path} does NOT redirect to /login`, async ({ page }) => {
      await goto(page, path)
      // Should stay on the path (not redirect to login)
      await expect(page).not.toHaveURL(/\/login/, { timeout: 3000 }).catch(() => {})
      const url = page.url()
      expect(url).not.toContain('/login')
    })
  }
})
