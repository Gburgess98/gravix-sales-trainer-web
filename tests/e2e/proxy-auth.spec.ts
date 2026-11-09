import { test, expect, Page } from '@playwright/test'
import { fakeManagerSession } from '../helpers/glass-fixtures'

/**
 * Pages whose proxy calls were bare fetch() (no Authorization → 401 on the hardened proxy) now send the signed-in user's Bearer.
 * Mocked session + mocked proxy only: this proves the browser sends authenticated proxy access and never writes identity headers
 * itself; it does not prove the API/proxy accept it (covered by the identity-boundary guards and the hosted checks).
 */
test.use({ viewport: { width: 1280, height: 800 } })
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

async function setup(page: Page) {
  const seen: { method: string; path: string; headers: Record<string, string> }[] = []
  await fakeManagerSession(page)
  await page.route('**/api/proxy/**', (route) => {
    const req = route.request()
    const u = new URL(req.url())
    seen.push({ method: req.method(), path: u.pathname + u.search, headers: req.headers() })
    return route.fulfill(json({ ok: true, items: [], runs: [], rows: [], reps: [], users: [], config: {}, user: {}, actions: [], open: [], completed: [] }))
  })
  return seen
}
const hand = (h: Record<string, string>) => ['x-org-id', 'x-proxy-secret', 'x-impersonated-user-id'].filter((k) => k in h)

const CASES: { name: string; url: string; expect: RegExp }[] = [
  { name: 'auto-assign run history (RunHistoryTable)', url: '/crm/manager/auto-assign', expect: /\/v1\/crm\/manager\/auto-assign\/runs/ },
  { name: 'manager console (RunHistoryTable)', url: '/crm/manager', expect: /\/v1\/crm\/manager\/auto-assign\/runs/ },
  { name: 'scoring admin (admin/score)', url: '/admin/score', expect: /\/v1\/admin\/scores/ },
  { name: 'health probe (health)', url: '/health', expect: /\/v1\/health/ },
]

for (const c of CASES) {
  test(`${c.name}: its proxy request carries the Bearer session and no hand-written identity headers`, async ({ page }) => {
    const seen = await setup(page)
    await page.goto(c.url)
    await expect.poll(() => seen.filter((s) => c.expect.test(s.path)).length, { timeout: 15_000 }).toBeGreaterThan(0)
    for (const s of seen.filter((x) => c.expect.test(x.path))) {
      expect(s.headers['authorization'] ?? '', `${s.method} ${s.path}`).toMatch(/^Bearer .+/)
      expect(hand(s.headers), `${s.method} ${s.path}`).toEqual([])
    }
  })
}

test('every /api/proxy request from these pages is authenticated (none anonymous)', async ({ page }) => {
  const seen = await setup(page)
  for (const c of CASES) await page.goto(c.url)
  await page.waitForLoadState('networkidle')
  const anon = seen.filter((s) => !/^Bearer .+/.test(s.headers['authorization'] ?? ''))
  expect(anon.map((s) => `${s.method} ${s.path}`)).toEqual([])
})
