import { test, expect } from '@playwright/test'
import { goto } from '../helpers/navigation'
import { expectShellVisible, expectNoPageCrash } from '../helpers/shell'
import { mockAllApiRoutes, MOCK_ACCOUNTS } from '../helpers/mocks'

/**
 * CRM workflow tests.
 * Covers: accounts list, account detail tabs, actions page, contacts.
 */

test.describe('CRM Accounts page', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApiRoutes(page)
    await goto(page, '/crm/accounts')
  })

  test('shell renders', async ({ page }) => {
    await expectShellVisible(page)
    await expectNoPageCrash(page)
  })

  test('accounts page heading is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Accounts/i })).toBeVisible({ timeout: 8000 })
  })

  test('account names from mock data appear', async ({ page }) => {
    await expect(page.getByText(MOCK_ACCOUNTS[0].name)).toBeVisible({ timeout: 8000 })
    await expect(page.getByText(MOCK_ACCOUNTS[1].name)).toBeVisible()
  })

  test('no page crash on load', async ({ page }) => {
    await expectNoPageCrash(page)
  })
})

test.describe('CRM Actions page', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApiRoutes(page)
  })

  test('without repId shows prompt to select a rep', async ({ page }) => {
    await goto(page, '/crm/actions')
    await expectShellVisible(page)
    await expect(page.getByText(/select a rep/i)).toBeVisible({ timeout: 8000 })
  })

  test('with repId loads actions for that rep', async ({ page }) => {
    // Mock actions response for a specific rep
    await page.route('**/api/proxy/v1/crm/actions**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          actions: [
            {
              id: 'action-1',
              title: 'Follow up with prospect',
              rep_id: 'test-rep-1',
              rep_name: 'Alex Johnson',
              contact_id: 'contact-1',
              due_at: null,
              completed_at: null,
              is_overdue: false,
            },
          ],
        }),
      })
    })
    await goto(page, '/crm/actions?repId=test-rep-1')
    await expect(page.getByText('Follow up with prospect')).toBeVisible({ timeout: 8000 })
  })

  test('status filter tabs are present', async ({ page }) => {
    await goto(page, '/crm/actions?repId=test-rep-1')
    await expect(page.getByRole('button', { name: 'Open' })).toBeVisible({ timeout: 6000 })
    await expect(page.getByRole('button', { name: 'Overdue' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Completed' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'All' })).toBeVisible()
  })

  test('filter switching does not crash', async ({ page }) => {
    await goto(page, '/crm/actions?repId=test-rep-1')
    await page.getByRole('button', { name: 'All' }).click()
    await expectNoPageCrash(page)
  })

  test('Refresh button is present', async ({ page }) => {
    await goto(page, '/crm/actions?repId=test-rep-1')
    await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible({ timeout: 6000 })
  })
})

test.describe('CRM Account detail page', () => {
  test.beforeEach(async ({ page }) => {
    // mockAllApiRoutes FIRST (lower LIFO priority)
    await mockAllApiRoutes(page)
    // Specific account detail mock LAST (higher LIFO priority — wins)
    await page.route('**/api/proxy/v1/accounts/acct-1**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          account: { id: 'acct-1', name: 'Acme Corp', domain: 'acme.com', health_band: 'watch', avg_score: 71 },
          linked_contacts: [],
          linked_calls: [],
        }),
      })
    })
    await goto(page, '/crm/accounts/acct-1')
  })

  test('shell renders on account detail page', async ({ page }) => {
    await expectShellVisible(page)
    await expectNoPageCrash(page)
  })

  test('account name appears in heading area', async ({ page }) => {
    await expect(page.getByText('Acme Corp').first()).toBeVisible({ timeout: 8000 })
  })

  test('workspace tabs are present', async ({ page }) => {
    // Account detail has: Overview | Contacts | Calls | Rescue | Intelligence
    await expect(page.getByRole('button', { name: 'Overview' })).toBeVisible({ timeout: 6000 })
    await expect(page.getByRole('button', { name: 'Contacts' })).toBeVisible()
  })

  test('tab switching does not crash', async ({ page }) => {
    const contactsTab = page.getByRole('button', { name: 'Contacts' })
    await expect(contactsTab).toBeVisible({ timeout: 6000 })
    await contactsTab.click()
    await expectNoPageCrash(page)
  })
})
