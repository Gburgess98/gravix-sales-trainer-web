import { test, expect, Page } from '@playwright/test'
import { goto } from '../helpers/navigation'
import { mockAllApiRoutes } from '../helpers/mocks'

/**
 * Tier 2A — sparring summary regression (Day 108).
 *
 * Protects the rep loop end-to-end in the UI:
 *   open active session → empty-state hint → send a message → buyer replies →
 *   "End round & score me" → legacy /score + Day 104 /complete fire →
 *   Sparring Summary panel renders → summary persists after reload.
 *
 * Stateful mocks mirror the real API: /score marks the session scored,
 * /complete returns + persists the structured summary.
 */

const SUMMARY = {
  overall: 61,
  dimensionAverages: { clarity: 68, confidence: 50, objectionHandling: 55, progression: 73 },
  turnCount: 2,
  strongestDimension: 'progression',
  weakestDimension: 'confidence',
  topFlags: [{ flag: 'vague', count: 1 }],
  weakMoments: [
    {
      turnId: 'turn-1',
      message: 'um maybe',
      weakMoment: 'The answer was vague and lacked confidence.',
      overall: 47,
      recommendedNextMove: 'Give a clearer answer and ask a next-step question.',
    },
  ],
  recommendedDrill: {
    type: 'confidence',
    title: 'Confidence Drill',
    reason: 'Confidence was the weakest area.',
  },
  summaryText: 'Good progression, but confidence needs work.',
  nextBestAction: 'Practise giving direct answers before asking for the next step.',
}

const BUYER_REPLY = 'Convince me — why is this worth the price?'

function sessionPayload(state: { scored: boolean; completed: boolean }) {
  return {
    ok: true,
    session: {
      id: 'session-1',
      rep_id: 'rep-1',
      persona_id: 'price_sensitive',
      difficulty: 'standard',
      total: state.scored ? 61 : null,
      total_score: state.scored ? 61 : null,
      xp_awarded: state.scored ? 25 : null,
      created_at: new Date().toISOString(),
      duration_ms: null,
      turns: state.scored ? 2 : null,
      summary: state.completed ? SUMMARY.summaryText : null,
      flags: null,
      meta: state.completed ? { session_summary: SUMMARY } : {},
    },
    turns: [],
  }
}

async function mockSparringRoutes(page: Page) {
  const state = { scored: false, completed: false }

  await page.route('**/api/proxy/v1/**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

    if (url.includes('/v1/sparring/sessions/session-1/turns') && method === 'POST') {
      return json({
        ok: true,
        turns: [
          { id: 'turn-1', session_id: 'session-1', role: 'user', text: 'um maybe', created_at: new Date().toISOString() },
          { id: 'turn-2', session_id: 'session-1', role: 'assistant', text: BUYER_REPLY, created_at: new Date().toISOString() },
        ],
        ai: BUYER_REPLY,
        state: { stage: 'discovery', buyerMood: 'sceptical', pressureLevel: 43 },
        turnScore: { overall: 47, clarity: 40, confidence: 25, objectionHandling: 55, progression: 60, flags: ['vague'] },
      })
    }

    if (url.includes('/v1/sparring/sessions/session-1/complete') && method === 'POST') {
      state.completed = true
      return json({ ok: true, summary: SUMMARY, assignmentCompleted: true })
    }

    if (url.includes('/v1/sparring/score') && method === 'POST') {
      state.scored = true
      return json({
        ok: true,
        session: sessionPayload(state).session,
        total: 61,
        xp_awarded: 25,
        flags: [],
        summary: 'Call scored 61%.',
      })
    }

    if (url.includes('/v1/sparring/sessions/session-1')) {
      return json(sessionPayload(state))
    }

    if (url.includes('/v1/sparring/personas')) {
      return json({ ok: true, personas: [] })
    }
    if (url.includes('/v1/sparring/leaderboard')) {
      return json({ ok: true, items: [] })
    }

    return route.fallback()
  })
}

test.describe('Sparring summary (Tier 2A)', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApiRoutes(page) // catch-all first — specific routes below win
    await mockSparringRoutes(page)
    await goto(page, '/sparring/session-1')
  })

  test('sparring summary: complete session and show coaching feedback', async ({ page }) => {
    // 1. Active session shows the empty-state hint
    await expect(
      page.getByText('Complete the sparring session to see your coaching summary.')
    ).toBeVisible({ timeout: 8000 })

    // 2. Send a message — buyer replies
    const composer = page.getByPlaceholder('Type your next line to the buyer…')
    await composer.fill('um maybe')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(page.getByText(BUYER_REPLY).first()).toBeVisible({ timeout: 8000 })

    // 3. End the round — legacy /score then Day 104 /complete fire
    await page.getByRole('button', { name: 'End round & score me' }).click()

    // 4. Structured summary panel renders from the /complete response
    await expect(page.getByText('Sparring Summary').first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('Overall 61').first()).toBeVisible()
    await expect(page.getByText('Clarity', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Confidence', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Objection handling', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Progression', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Confidence Drill').first()).toBeVisible()
    await expect(page.getByText('Weak moments').first()).toBeVisible()
    await expect(page.getByText('Next best action').first()).toBeVisible()
    await expect(page.getByText('Good progression, but confidence needs work.').first()).toBeVisible()

    // 5. Summary persists after reload (hydrated from meta.session_summary)
    await page.reload()
    await expect(page.getByText('Sparring Summary').first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('Confidence Drill').first()).toBeVisible()
    await expect(page.getByText('Next best action').first()).toBeVisible()
  })
})
