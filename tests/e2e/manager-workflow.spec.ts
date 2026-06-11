import { test, expect, Page } from '@playwright/test'
import { goto } from '../helpers/navigation'
import { clickTab } from '../helpers/shell'
import { mockAllApiRoutes } from '../helpers/mocks'

/**
 * Sprint 4 — manager workflow regression (Day 97).
 *
 * Protects the commercial loop end-to-end in the UI:
 *   open /coaching → review queue → assign coaching from weak call →
 *   mark call reviewed → queue clears → Open Coaching shows the assignment.
 *
 * All proxy routes are mocked; a tiny stateful mock flips the
 * command-centre/review-queue payloads after each POST, mirroring
 * what the real API does.
 */

const QUEUE_CALL = {
  callId: 'call-1',
  repId: 'rep-1',
  repName: 'Alex Rep',
  title: 'Demo weak call',
  overallScore: 42,
  weakestSkill: 'Objection',
  createdAt: new Date().toISOString(),
  reasons: ['Score below 70', 'Objection below 50'],
}

const CREATED_ASSIGNMENT = {
  assignmentId: 'assignment-1',
  repId: 'rep-1',
  repName: 'Alex Rep',
  title: 'Objection Handling Drill',
  status: 'open',
  dueAt: new Date(Date.now() + 3 * 86400000).toISOString(),
  priority: 'high',
  type: 'call_review',
  source: 'manager_review',
  sourceCallId: 'call-1',
  originLabel: 'Assigned via review',
  notes: 'Focus on the weakest skill: Objection.',
}

function commandCentrePayload(state: { reviewed: boolean; assigned: boolean }) {
  return {
    ok: true,
    windowDays: 30,
    reviewHistoryAvailable: true,
    teamHealth: {
      status: state.reviewed ? 'amber' : 'red',
      averageScore: 61,
      reviewedCalls: state.reviewed ? 1 : 0,
      callsNeedingReview: state.reviewed ? 0 : 1,
      openAssignments: state.assigned ? 1 : 0,
      overdueAssignments: 0,
    },
    repsNeedingAttention: [],
    callsNeedingReview: state.reviewed
      ? []
      : [
          {
            callId: QUEUE_CALL.callId,
            repId: QUEUE_CALL.repId,
            repName: QUEUE_CALL.repName,
            title: QUEUE_CALL.title,
            overallScore: QUEUE_CALL.overallScore,
            weakestSkill: QUEUE_CALL.weakestSkill,
            createdAt: QUEUE_CALL.createdAt,
          },
        ],
    openAssignments: state.assigned ? [CREATED_ASSIGNMENT] : [],
    weakestSkills: [
      {
        skill: 'Objection',
        count: 3,
        averageScore: 45,
        previousAverageScore: 52,
        delta: -7,
        trend: 'down',
        trendLabel: '↓ from 52',
      },
    ],
    coachingImpact: {
      completedAssignments: 2,
      skillsImproving: 0,
      skillsDeclining: 1,
      summary: '0 skills improving, 1 declining',
    },
    roi: {
      callsReviewed: state.reviewed ? 1 : 0,
      estimatedMinutesSaved: state.reviewed ? 20 : 0,
      estimatedHoursSaved: state.reviewed ? 0.3 : 0,
    },
  }
}

/**
 * Stateful manager-workflow mocks. Registered AFTER mockAllApiRoutes so they
 * win (Playwright resolves routes last-registered-first); anything else falls
 * back to the catch-all.
 */
async function mockManagerWorkflow(page: Page) {
  const state = { reviewed: false, assigned: false }

  await page.route('**/api/proxy/v1/**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

    if (url.includes('/v1/manager/command-centre')) {
      return json(commandCentrePayload(state))
    }

    if (url.includes('/v1/manager/review-queue')) {
      return json({
        ok: true,
        windowDays: 30,
        reviewHistoryAvailable: true,
        items: state.reviewed ? [] : [QUEUE_CALL],
        count: state.reviewed ? 0 : 1,
      })
    }

    if (url.includes('/v1/calls/call-1/manager-review') && method === 'POST') {
      state.reviewed = true
      return json({
        ok: true,
        review: {
          callId: 'call-1',
          managerId: 'manager-1',
          status: 'reviewed',
          note: null,
          createdAt: new Date().toISOString(),
        },
      })
    }

    if (url.includes('/v1/assignments/manager')) {
      return json({
        ok: true,
        items: state.assigned
          ? [
              {
                id: 'assignment-1',
                rep_id: 'rep-1',
                type: 'call_review',
                target_id: 'call-1',
                title: 'Objection Handling Drill',
                status: 'assigned',
                due_at: CREATED_ASSIGNMENT.dueAt,
                created_at: new Date().toISOString(),
                source: 'manager_review',
                meta: { assignment_origin: 'manager_review', priority: 'high', source_call_id: 'call-1' },
              },
            ]
          : [],
      })
    }

    if (url.includes('/v1/assignments') && method === 'POST') {
      state.assigned = true
      return json({
        ok: true,
        item: {
          id: 'assignment-1',
          title: 'Objection Handling Drill',
          type: 'call_review',
          status: 'assigned',
          rep_id: 'rep-1',
          target_id: 'call-1',
          due_at: CREATED_ASSIGNMENT.dueAt,
        },
      })
    }

    return route.fallback()
  })
}

test.describe('Manager workflow (Sprint 4)', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllApiRoutes(page) // catch-all first — specific routes below win
    await mockManagerWorkflow(page)
    await goto(page, '/coaching')
  })

  test('manager workflow: review call and assign coaching from command centre', async ({ page }) => {
    // 1. Overview loads with command-centre data
    await expect(page.getByText('Team Health').first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('Demo weak call').first()).toBeVisible()

    // 2. Open the Review Queue tab — the weak call is queued with reasons
    await clickTab(page, 'Review Queue')
    await expect(page.getByText('Calls Awaiting Manager Review')).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('Demo weak call').first()).toBeVisible()
    await expect(page.getByText('Objection below 50').first()).toBeVisible()

    // 3. Assign coaching first (so the call is still present), via the queue row
    await page.getByRole('button', { name: 'Assign Coaching' }).first().click()

    // 4. Modal opens pre-filled from the weakest skill
    const modal = page.locator('.fixed').filter({ hasText: 'Note for the rep' })
    await expect(modal).toBeVisible()
    await expect(modal.getByText('Alex Rep · score 42')).toBeVisible()
    await expect(modal.locator('input').first()).toHaveValue('Objection Handling Drill')

    // 5. Submit — assignment created
    await modal.getByRole('button', { name: 'Assign Coaching' }).click()
    await expect(page.getByText('Coaching assigned.').first()).toBeVisible({ timeout: 8000 })

    // 6. Mark the call reviewed from the queue
    await page.getByRole('button', { name: 'Mark Reviewed' }).first().click()
    await expect(page.getByText('Call marked as reviewed.').first()).toBeVisible({ timeout: 8000 })

    // 7. Queue clears
    await expect(page.getByText('No calls need manager review.')).toBeVisible({ timeout: 8000 })

    // 8. Back on Overview: Open Coaching shows the new assignment, linked to the call
    await clickTab(page, 'Overview')
    await expect(page.getByText('Objection Handling Drill').first()).toBeVisible({ timeout: 8000 })
    await expect(page.getByText('Assigned via review').first()).toBeVisible()
    await expect(page.getByRole('link', { name: 'From call' }).first()).toBeVisible()
  })
})
