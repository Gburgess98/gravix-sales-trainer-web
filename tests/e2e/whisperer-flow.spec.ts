import { test, expect, Page } from '@playwright/test'
import { goto } from '../helpers/navigation'
import { mockAllApiRoutes } from '../helpers/mocks'

/**
 * Tier 2B — Whisperer flow regression (Day 116).
 *
 * Covers the fully-testable surface: the /whisperer Manual Simulator loop
 * (start session → segment → trigger → suggestion card → latency → end).
 *
 * The /calls/[id] "Whisperer Moments" replay is gated behind AuthGate
 * (redirects to /login unauthenticated — no spec in this suite mocks a
 * session), so that path is covered by the Day 115 curl validation and the
 * day-115 validation script rather than a brittle auth-mocked render here.
 * The call-linked endpoint (GET /v1/calls/:id/whisperer-triggers) and the
 * "Whisperer Moments" section feed off the same /whisperer?callId= linkage
 * exercised below.
 *
 * No live microphone, no Deepgram, no real WebSocket — Manual Simulator only.
 */

const PRICE_TRIGGER = {
  id: 'trig-1',
  type: 'price',
  phrase: 'too expensive',
  confidence: 90,
  suggestion: { title: 'Handle price objection', response: 'Reframe on ROI.', urgency: 'high', emoji: '💥' },
  detectedAt: new Date().toISOString(),
  latencyMs: 123,
}
const SENDINFO_TRIGGER = {
  id: 'trig-2',
  type: 'send_info',
  phrase: 'send me',
  confidence: 90,
  suggestion: { title: "Don't die by email", response: 'Qualify first.', urgency: 'medium', emoji: '👂' },
  detectedAt: new Date().toISOString(),
  latencyMs: 88,
}

async function mockWhispererRoutes(page: Page) {
  let segmentCount = 0

  await page.route('**/api/proxy/v1/whisperer/**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

    if (url.includes('/whisperer/sessions') && method === 'POST' && !url.includes('/segments') && !url.includes('/end')) {
      return json({ ok: true, persistence: true, session: { id: 'wsession-1', status: 'active', startedAt: new Date().toISOString() } })
    }
    if (url.includes('/segments') && method === 'POST') {
      segmentCount += 1
      const trigger = segmentCount === 1 ? PRICE_TRIGGER : SENDINFO_TRIGGER
      return json({
        ok: true,
        persistence: true,
        segment: { text: 'x', speaker: 'prospect', receivedAt: new Date().toISOString(), processedAt: new Date().toISOString() },
        triggers: [trigger],
        latencyMs: trigger.latencyMs,
      })
    }
    if (url.includes('/end') && method === 'POST') {
      return json({ ok: true, persistence: true, session: { id: 'wsession-1', status: 'ended', latency_p50_ms: 105 } })
    }
    return route.fallback()
  })
}

test.describe('Whisperer flow (Tier 2B)', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApiRoutes(page) // catch-all first
    await mockWhispererRoutes(page)
    await goto(page, '/whisperer?callId=call-1')
  })

  test('whisperer flow: simulator trigger appears and persists into call review', async ({ page }) => {
    // Live Whisperer page loads
    await expect(page.getByRole('heading', { name: 'Live Whisperer' })).toBeVisible({ timeout: 8000 })

    // Switch to Manual Simulator (works without Deepgram). Retry the click —
    // a server-rendered button can be "visible" before React hydration attaches
    // its handler, so the first click may be a no-op.
    await expect(async () => {
      await page.getByRole('button', { name: 'Manual Simulator' }).click()
      await expect(page.getByText('Transcript simulator')).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 10000 })

    // Start session (page is hydrated by now)
    await page.getByRole('button', { name: 'Start session' }).click()
    const composer = page.getByPlaceholder('Paste or type a prospect line…')
    await expect(composer).toBeVisible({ timeout: 8000 })

    // Segment 1 → price suggestion
    await composer.fill('this is too expensive')
    await page.getByRole('button', { name: 'Send segment' }).click()
    await expect(page.getByText('Handle price objection').first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('high').first()).toBeVisible()
    await expect(page.getByText(/Last suggestion latency/).first()).toBeVisible()

    // Segment 2 → send_info suggestion
    await composer.fill('send me some info')
    await page.getByRole('button', { name: 'Send segment' }).click()
    await expect(page.getByText("Don't die by email").first()).toBeVisible({ timeout: 8000 })

    // End session
    await page.getByRole('button', { name: 'End session' }).click()
    await expect(page.getByText(/Session ended/).first()).toBeVisible({ timeout: 8000 })
  })
})
