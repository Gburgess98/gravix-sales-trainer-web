import { test, expect } from '@playwright/test'

/**
 * Day 268 — Scoring v2 Call Review UI, exercised through the dev preview route
 * (/dev/scoring-v2-preview) which renders the deterministic fixtures through the
 * real components. No auth, no proxy mocks, no production data.
 */

const PREVIEW = '/dev/scoring-v2-preview'

async function pickFixture(page: import('@playwright/test').Page, title: string) {
  await page.getByRole('button', { name: title }).click()
}

test.describe('Scoring v2 Call Review (fixtures)', () => {
  test('v1-only result shows no criteria UI', async ({ page }) => {
    await page.goto(PREVIEW)
    await pickFixture(page, 'v1-only (no v2)')
    await expect(page.getByTestId('v1-fallback-note')).toBeVisible()
    // No expandable criteria control anywhere
    await expect(page.getByRole('button', { name: /criteri/ })).toHaveCount(0)
  })

  test('malformed v2 falls back to v1', async ({ page }) => {
    await page.goto(PREVIEW)
    await pickFixture(page, 'Malformed v2 → v1 fallback')
    await expect(page.getByTestId('v1-fallback-note')).toBeVisible()
    await expect(page.getByRole('button', { name: /criteri/ })).toHaveCount(0)
  })

  test('valid v2 expands criteria with keyboard-accessible controls', async ({ page }) => {
    await page.goto(PREVIEW)
    await pickFixture(page, 'Strong · non-degraded')
    const expander = page.getByRole('button', { name: /criteri/ }).first()
    await expect(expander).toHaveAttribute('aria-expanded', 'false')
    await expander.click()
    await expect(expander).toHaveAttribute('aria-expanded', 'true')
    // A criterion label + status chip should now be visible
    await expect(page.getByText('Set agenda and establish credibility').first()).toBeVisible()
    await expect(page.getByText('Pass').first()).toBeVisible()
  })

  test('degraded result shows the provisional banner', async ({ page }) => {
    await page.goto(PREVIEW)
    await pickFixture(page, 'Degraded · stub')
    await expect(page.getByText('Provisional score — this review used a limited scoring mode.')).toBeVisible()
    // raw internal code is never shown as the message
    await expect(page.getByText('stub_provider', { exact: true })).toHaveCount(0)
  })

  test('evidence timestamp jump fires', async ({ page }) => {
    await page.goto(PREVIEW)
    await pickFixture(page, 'Strong · non-degraded')
    await page.getByRole('button', { name: /criteri/ }).first().click()
    await page.getByRole('button', { name: /Jump to \d+:\d{2}/ }).first().click()
    await expect(page.getByTestId('jump-indicator')).toBeVisible()
  })

  test('objection library link appears only with a real id', async ({ page }) => {
    await page.goto(PREVIEW)
    await pickFixture(page, 'Objection matches')
    // One objection is linked, one is not → exactly one library link
    await expect(page.getByRole('link', { name: /Objection Library/ })).toHaveCount(1)
    await expect(page.getByRole('link', { name: /Objection Library/ })).toHaveAttribute('href', '/intelligence?tab=objections')
  })
})
