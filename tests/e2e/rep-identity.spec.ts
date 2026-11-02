import { test, expect, Page } from '@playwright/test'
import { fakeManagerSession } from '../helpers/glass-fixtures'

/** Rep detail heading is resolved from the roster, never the route UUID. Fully mocked (fake local session). */
const ID = '278be53c-0528-4b67-b114-a4e815ba8be6'
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const j = (b: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) })

async function setup(page: Page, items: unknown[], delayMs = 0) {
  await fakeManagerSession(page)
  await page.route('**/api/proxy/**', async (route) => {
    const u = route.request().url()
    if (u.includes('/v1/team/members')) {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
      return route.fulfill(j({ ok: true, items, seats: {}, warnings: [] }))
    }
    if (u.includes('/v1/dashboard/rep-summary')) return route.fulfill(j({ ok: true, userId: ID, recent_calls: [] }))
    if (u.includes('/v1/admin/config') || u.includes('/v1/reps/me')) return route.fulfill(j({ ok: true, is_manager: true }))
    return route.fulfill(j({ ok: true, items: [] }))
  })
}

const member = (o: object) => ({ id: ID, name: null, email: null, role: 'SalesRep', manager_id: null, office_id: null, office_name: null, scope: 'company', identity: 'rep', warnings: [], ...o })

test.describe('rep detail identity', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('roster name is the heading; back link goes to /team; no UUID in heading', async ({ page }) => {
    await setup(page, [member({ name: 'Priya Nair' })])
    await page.goto(`/crm/reps/${ID}`)
    const h1 = page.getByRole('heading', { level: 1 })
    await expect(h1).toHaveText('Priya Nair', { timeout: 15000 })
    expect(await h1.innerText()).not.toMatch(UUID_RE)
    const back = page.getByRole('link', { name: '← Team' })
    await expect(back).toHaveAttribute('href', '/team')
    await expect(page.getByText('← CRM')).toHaveCount(0)
    expect(page.url()).not.toContain('Priya')
  })

  test('missing name falls back to the email local part', async ({ page }) => {
    await setup(page, [member({ name: '', email: 'priya.nair@example.test' })])
    await page.goto(`/crm/reps/${ID}`)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('priya.nair', { timeout: 15000 })
  })

  test('unmatched UUID shows "Team member", never the id', async ({ page }) => {
    await setup(page, [member({ id: '11111111-1111-4111-8111-111111111111', name: 'Alex Johnson' })])
    await page.goto(`/crm/reps/${ID}`)
    const h1 = page.getByRole('heading', { level: 1 })
    await expect(h1).toHaveText('Team member', { timeout: 15000 })
    expect(await h1.innerText()).not.toMatch(UUID_RE)
  })

  test('while identity loads the heading is a skeleton, not the UUID', async ({ page }) => {
    await setup(page, [member({ name: 'Priya Nair' })], 1500)
    await page.goto(`/crm/reps/${ID}`)
    const h1 = page.getByRole('heading', { level: 1 })
    await expect(h1).toHaveAttribute('aria-busy', 'true', { timeout: 10000 })
    expect((await h1.innerText()).trim()).toBe('')
    await expect(h1).toHaveText('Priya Nair', { timeout: 15000 })
  })

  test('Team → rep opens the named page', async ({ page }) => {
    await setup(page, [member({ name: 'Priya Nair', office_name: 'Leeds', office_id: 'o1', scope: 'office' })])
    await page.goto('/team')
    await page.getByRole('link', { name: /Priya Nair/ }).first().click()
    await expect(page).toHaveURL(new RegExp(`/crm/reps/${ID}`))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Priya Nair', { timeout: 15000 })
  })
})
