import { test, expect } from '@playwright/test'
import { goto, clickNavLink, expectPath } from '../helpers/navigation'
import { expectShellVisible, expectNoPageCrash } from '../helpers/shell'
import { mockAllApiRoutes } from '../helpers/mocks'

/**
 * Navigation + shell stability tests.
 * Verifies the sidebar/topbar shell renders consistently across routes
 * and that client-side navigation between shell paths works correctly.
 */

test.describe('Shell structure', () => {
  test('sidebar and main content render on coaching', async ({ page }) => {
    await mockAllApiRoutes(page)
    await goto(page, '/coaching')
    await expectShellVisible(page)
    await expectNoPageCrash(page)
  })

  test('sidebar and main content render on CRM accounts', async ({ page }) => {
    await mockAllApiRoutes(page)
    await goto(page, '/crm/accounts')
    await expectShellVisible(page)
    await expectNoPageCrash(page)
  })

  test('sidebar and main content render on call library', async ({ page }) => {
    await mockAllApiRoutes(page)
    await goto(page, '/call-library')
    await expectShellVisible(page)
    await expectNoPageCrash(page)
  })

  test('sidebar and main content render on assignments', async ({ page }) => {
    await mockAllApiRoutes(page)
    await goto(page, '/assignments')
    await expectShellVisible(page)
    await expectNoPageCrash(page)
  })

  test('sidebar brand link is visible', async ({ page }) => {
    await mockAllApiRoutes(page)
    await goto(page, '/coaching')
    // Gravix brand/logo link in sidebar
    await expect(page.locator('aside').getByText('Gravix').first()).toBeVisible()
  })
})

test.describe('Sidebar navigation', () => {
  test('Command Centre nav link is present in sidebar', async ({ page }) => {
    await mockAllApiRoutes(page)
    await goto(page, '/dashboard')
    const link = page.locator('aside').getByRole('link', { name: 'Command Centre' })
    await expect(link).toBeVisible()
  })

  test('Calls nav link is present in sidebar', async ({ page }) => {
    await mockAllApiRoutes(page)
    await goto(page, '/coaching')
    const link = page.locator('aside').getByRole('link', { name: 'Calls' })
    await expect(link).toBeVisible()
  })

  test('Assignments nav link is present in sidebar', async ({ page }) => {
    await mockAllApiRoutes(page)
    await goto(page, '/coaching')
    const link = page.locator('aside').getByRole('link', { name: 'Assignments' })
    await expect(link).toBeVisible()
  })

  test('clicking Command Centre nav link navigates to /coaching', async ({ page }) => {
    await mockAllApiRoutes(page)
    await goto(page, '/call-library')
    await clickNavLink(page, 'Command Centre')
    await expectPath(page, '/coaching')
  })
})

test.describe('Shell persistence across navigation', () => {
  test('sidebar persists when navigating between shell paths', async ({ page }) => {
    await mockAllApiRoutes(page)
    await goto(page, '/coaching')
    const aside = page.locator('aside').first()
    await expect(aside).toBeVisible()

    // Navigate to another shell path
    await page.goto('/crm/accounts', { waitUntil: 'domcontentloaded' })
    await expect(aside).toBeVisible()
  })

  test('shell does not render on /login (legacy layout)', async ({ page }) => {
    await goto(page, '/login')
    // The sidebar aside should NOT be present on the login page
    await expect(page.locator('aside').first()).not.toBeVisible()
  })
})

test.describe('Workspace tab switching', () => {
  test('coaching workspace tabs are all visible', async ({ page }) => {
    await mockAllApiRoutes(page)
    await goto(page, '/coaching')
    await expect(page.getByRole('button', { name: 'Overview' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Interventions' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Assignments' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Replay Queue' })).toBeVisible()
  })

  test('clicking a coaching tab switches the content', async ({ page }) => {
    await mockAllApiRoutes(page)
    await goto(page, '/coaching')

    // Overview content is initially visible
    await expect(page.getByText('AI Manager Briefing')).toBeVisible({ timeout: 8000 })

    // Switch to Assignments tab
    await page.getByRole('button', { name: 'Assignments' }).click()

    // Assignments content should now be visible
    await expect(page.getByText('Full Assignment Manager')).toBeVisible({ timeout: 6000 })

    // Switch to Replay Queue
    await page.getByRole('button', { name: 'Replay Queue' }).click()
    await expect(page.getByText('Full Call Library')).toBeVisible({ timeout: 6000 })
  })
})
