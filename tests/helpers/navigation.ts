import { Page, expect } from '@playwright/test'

/**
 * Navigate to a path and wait for the page to be interactive.
 * Uses 'domcontentloaded' so we don't wait for all network requests.
 */
export async function goto(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
}

/**
 * Navigate via a sidebar link by its text label.
 */
export async function clickNavLink(page: Page, label: string) {
  const link = page.locator('aside').getByRole('link', { name: label, exact: false }).first()
  await expect(link).toBeVisible()
  await link.click()
}

/**
 * Assert the current page URL matches the given path (prefix).
 */
export async function expectPath(page: Page, path: string) {
  await expect(page).toHaveURL(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}
