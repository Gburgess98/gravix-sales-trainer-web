import { test, expect, Page } from '@playwright/test'
import { fakeManagerSession } from '../helpers/glass-fixtures'

/**
 * 2026-11 production release decisions (mocked session + mocked proxy only):
 *  - /admin/reps and /crm/manager/nudges: calm unavailable result, and the page never mounts (no requests for its data)
 *  - /crm/contacts/[id]: its data is requested through the authenticated browser proxy (Bearer), never a server-side localhost fetch
 */
test.use({ viewport: { width: 1280, height: 800 } })
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })
const CONTACT = '33333333-4444-4555-8666-777777777777'

async function setup(page: Page) {
  const seen: { url: string; auth: string }[] = []
  await fakeManagerSession(page)
  await page.route('**/api/proxy/**', (route) => {
    const req = route.request()
    const url = req.url()
    seen.push({ url, auth: req.headers()['authorization'] ?? '' })
    if (url.includes('/v1/admin/config')) return route.fulfill(json({ ok: true, config: {} }))
    if (url.includes(`/v1/crm/contacts/${CONTACT}/activity`)) return route.fulfill(json({ ok: true, items: [{ id: 'a1', type: 'note', body: 'Asked about annual pricing', created_at: new Date().toISOString() }] }))
    if (url.includes(`/v1/crm/contacts/${CONTACT}`) && !url.includes('/actions')) return route.fulfill(json({ ok: true, health: { band: 'warm', score: 61, next_action: 'Send the pricing sheet', stats: { open_actions: 2 } } }))
    if (url.includes('/v1/reps/me')) return route.fulfill(json({ ok: true, id: 'x', tier: 'Manager' }))
    return route.fulfill(json({ ok: true, items: [], reps: [], users: [], contact: null }))
  })
  return seen
}

for (const route of ['/admin/reps', '/crm/manager/nudges']) {
  test(`${route}: calm unavailable result, no data requests, no console errors`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    const seen = await setup(page)
    await page.goto(route)
    await expect(page.getByText('This page isn’t available yet')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to your workspace' })).toBeVisible()
    const body = await page.locator('body').innerText()
    expect(body).not.toMatch(/forbidden|not_found|undefined|\[object|HTTP \d/i)
    expect(seen.filter((s) => /\/v1\/admin\/reps|\/v1\/crm\/manager\/nudges|\/v1\/team\/users/.test(s.url))).toEqual([])
    expect(errors).toEqual([])
  })
}

test('no link to either withheld route anywhere on the CRM overview and home pages', async ({ page }) => {
  await setup(page)
  for (const p of ['/', '/crm/overview']) {
    await page.goto(p)
    await page.waitForLoadState('networkidle')
    const hrefs = await page.locator('a[href]').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href') || ''))
    expect(hrefs.filter((h) => /^\/admin\/reps|^\/crm\/manager\/nudges/.test(h)), p).toEqual([])
  }
})

test('/crm/contacts/[id]: health and activity load through the authenticated browser proxy', async ({ page }) => {
  const seen = await setup(page)
  const stray: string[] = []
  page.on('request', (r) => { const u = new URL(r.url()); if (u.hostname === 'localhost' && u.port !== '3000') stray.push(r.url()) }) // anything else on localhost would be a server-style fallback
  await page.goto(`/crm/contacts/${CONTACT}`)
  await expect(page.getByText('Asked about annual pricing')).toBeVisible()
  await expect(page.getByText('Send the pricing sheet')).toBeVisible()
  const mine = seen.filter((s) => s.url.includes(`/v1/crm/contacts/${CONTACT}`) && !s.url.includes('/actions'))
  expect(mine.length).toBeGreaterThanOrEqual(2)
  // every /api/proxy request this page and its panels send (health, activity, header, notes, actions, brief) carries the Bearer session
  const all = seen.filter((x) => /\/v1\/crm\/(contacts|actions)\//.test(x.url) || x.url.includes('/v1/crm/contacts'))
  expect(all.length).toBeGreaterThanOrEqual(4)
  for (const m of all) expect(m.auth, m.url).toMatch(/^Bearer .+/)
  expect(stray).toEqual([])
})
