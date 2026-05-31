import { Page } from '@playwright/test'

/**
 * Shared fixture data used across tests.
 * Mirrors the actual API response shapes without inventing new fields.
 */

export const MOCK_REP = {
  rep_id: 'test-rep-1',
  rep_name: 'Alex Johnson',
  risk_band: 'at_risk',
  risk_score: 72,
  counts: { open: 4, overdue: 1, completed_today: 0 },
  reasons: ['objection_handling', 'weak_close'],
  meta: { weakest_skill: 'Objection handling', avg_score: 61, flagged_calls: 2, critical_calls: 1 },
}

export const MOCK_REP_2 = {
  rep_id: 'test-rep-2',
  rep_name: 'Sam Rivera',
  risk_band: 'watch',
  risk_score: 58,
  counts: { open: 2, overdue: 0, completed_today: 1 },
  reasons: ['discovery'],
  meta: { weakest_skill: 'Discovery', avg_score: 74, flagged_calls: 0, critical_calls: 0 },
}

export const MOCK_HEADLINE = {
  reps_total: 8,
  reps_at_risk: 2,
  reps_watch: 3,
  overdue_actions_total: 3,
  open_actions_total: 14,
  window_days: 7,
}

export const MOCK_REPORTING = {
  ok: true,
  critical_calls_today: 1,
  flagged_calls_this_week: 4,
  auto_assignments_created: 2,
  assignment_completion_rate: 0.62,
  reps_needing_help: [
    { rep_id: 'test-rep-1', flagged_calls: 2, critical_calls: 1, avg_score: 61, weakest_skill: 'Objection handling' },
    { rep_id: 'test-rep-2', flagged_calls: 0, critical_calls: 0, avg_score: 74, weakest_skill: 'Discovery' },
  ],
}

export const MOCK_ASSIGNMENTS = [
  {
    id: 'assign-1',
    title: 'Objection handling drill',
    type: 'drill',
    status: 'open',
    rep_id: 'test-rep-1',
    due_at: new Date(Date.now() + 86400000 * 2).toISOString(),
    created_at: new Date().toISOString(),
    meta: { urgency: 'high' },
  },
  {
    id: 'assign-2',
    title: 'Closing practice',
    type: 'drill',
    status: 'open',
    rep_id: 'test-rep-2',
    due_at: new Date(Date.now() - 86400000).toISOString(), // overdue
    created_at: new Date().toISOString(),
    meta: {},
  },
]

export const MOCK_CALLS = [
  {
    id: 'call-1',
    filename: 'prospect-call-2024-01.mp3',
    score_overall: 52,
    created_at: new Date().toISOString(),
    rep_name: 'Alex Johnson',
    status: 'reviewed',
    flags: ['weak_close'],
  },
  {
    id: 'call-2',
    filename: 'discovery-call-2024-02.mp3',
    score_overall: 67,
    created_at: new Date().toISOString(),
    rep_name: 'Sam Rivera',
    status: 'reviewed',
    flags: [],
  },
]

export const MOCK_ACCOUNTS = [
  { id: 'acct-1', name: 'Acme Corp', domain: 'acme.com', avg_score: 71, stats: { contacts: 3, calls: 8 } },
  { id: 'acct-2', name: 'TechFlow Inc', domain: 'techflow.io', avg_score: 58, stats: { contacts: 1, calls: 3 } },
]

/**
 * Intercept all /api/proxy/* requests and return mock responses.
 * Keeps tests independent of the backend server.
 */
export async function mockAllApiRoutes(page: Page) {
  await page.route('/api/proxy/**', async (route) => {
    const url = route.request().url()

    if (url.includes('/v1/crm/manager/control-centre')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, headline: MOCK_HEADLINE, reps_all: [MOCK_REP, MOCK_REP_2] }),
      })
    }

    if (url.includes('/v1/dashboard/reporting-summary')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_REPORTING),
      })
    }

    if (url.includes('/v1/assignments')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, assignments: MOCK_ASSIGNMENTS }),
      })
    }

    if (url.includes('/v1/calls/paged')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, calls: MOCK_CALLS }),
      })
    }

    if (url.includes('/v1/crm/accounts')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, accounts: MOCK_ACCOUNTS }),
      })
    }

    if (url.includes('/v1/crm/actions')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, actions: [] }),
      })
    }

    if (url.includes('/v1/dashboard')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      })
    }

    if (url.includes('/v1/admin/config')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, is_manager: true }),
      })
    }

    // Default: empty success for unmatched proxy routes
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    })
  })
}
