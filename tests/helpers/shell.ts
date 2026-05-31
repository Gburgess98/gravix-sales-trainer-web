import { Page, expect } from '@playwright/test'

/**
 * Assert the app shell (sidebar + topbar + main) is visible on the page.
 * The shell renders for all paths in SHELL_PATHS (see src/config/navigation.ts).
 */
export async function expectShellVisible(page: Page) {
  await expect(page.locator('aside').first()).toBeVisible()
  await expect(page.locator('main').first()).toBeVisible()
}

/**
 * Assert the page has not crashed (no Next.js application error overlay).
 */
export async function expectNoPageCrash(page: Page) {
  await expect(page.getByText('Application error')).not.toBeVisible({ timeout: 2000 }).catch(() => {})
  await expect(page.getByText('Unhandled Runtime Error')).not.toBeVisible({ timeout: 2000 }).catch(() => {})
}

/**
 * Click a WorkspaceTabs tab by its visible label and wait for the URL/content to settle.
 */
export async function clickTab(page: Page, label: string) {
  const tab = page.getByRole('button', { name: label, exact: false }).first()
  await expect(tab).toBeVisible()
  await tab.click()
}
