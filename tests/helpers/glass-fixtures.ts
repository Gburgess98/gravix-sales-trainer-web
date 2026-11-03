import { Page } from '@playwright/test'

/**
 * Staging-safe fixtures for the glass manager screens. A fabricated, unexpired Supabase session is
 * placed in localStorage (supabase-js reads it without any network call) and every /api/proxy call is
 * mocked, so nothing here touches Supabase, staging or production data.
 */
const REF = 'gekckdexiedadxqageim' // storage key suffix only; derived from NEXT_PUBLIC_SUPABASE_URL

function b64(o: object) {
  return Buffer.from(JSON.stringify(o)).toString('base64url')
}

export async function fakeManagerSession(page: Page) {
  const exp = Math.floor(Date.now() / 1000) + 3600 * 6
  const uid = '00000000-0000-4000-8000-000000000001'
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: uid, exp, role: 'authenticated' })}.sig`
  const session = {
    access_token: token,
    refresh_token: 'fake-refresh',
    expires_in: 3600 * 6,
    expires_at: exp,
    token_type: 'bearer',
    user: { id: uid, aud: 'authenticated', email: 'manager@example.test', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  }
  await page.addInitScript(([key, value]) => {
    try { window.localStorage.setItem(key, value) } catch {}
  }, [`sb-${REF}-auth-token`, JSON.stringify(session)])
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString()
const daysAhead = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()

export const REPS = [
  { id: 'r1', name: 'Alex Johnson', email: 'alex@example.test', role: 'SalesRep', office: 'London', avg30: 52, avg90: 61, risk: 'red', calls: 9 },
  { id: 'r2', name: 'Sam Rivera', email: 'sam@example.test', role: 'SalesRep', office: 'London', avg30: 66, avg90: 64, risk: 'amber', calls: 12 },
  { id: 'r3', name: 'Priya Nair', email: 'priya@example.test', role: 'SalesRep', office: 'Leeds', avg30: 84, avg90: 77, risk: null, calls: 15 },
  { id: 'r4', name: 'Jordan Blake', email: 'jordan@example.test', role: 'SalesRep', office: 'Leeds', avg30: 78, avg90: 79, risk: null, calls: 7 },
  { id: 'r5', name: 'Casey Morgan', email: 'casey@example.test', role: 'SalesRep', office: null, avg30: null, avg90: null, risk: null, calls: 0 },
]

export const COMMAND_CENTRE = {
  ok: true,
  windowDays: 30,
  teamHealth: { status: 'amber', averageScore: 68, reviewedCalls: 31, callsNeedingReview: 3, openAssignments: 6, overdueAssignments: 2 },
  repsNeedingAttention: [
    { repId: 'r1', repName: 'Alex Johnson', averageScore: 52, riskLevel: 'red', riskReason: 'Score below 55', recommendedAction: 'Review the last two calls and assign an objection drill' },
    { repId: 'r2', repName: 'Sam Rivera', averageScore: 66, riskLevel: 'amber', riskReason: 'Overdue coaching', recommendedAction: 'Check in on the overdue closing drill' },
  ],
  callsNeedingReview: [
    { callId: 'c1', repId: 'r1', repName: 'Alex Johnson', title: 'Acme discovery call', overallScore: 48, weakestSkill: 'Objection handling', createdAt: daysAgo(0) },
    { callId: 'c2', repId: 'r2', repName: 'Sam Rivera', title: 'TechFlow demo', overallScore: 63, weakestSkill: 'Closing', createdAt: daysAgo(1) },
    { callId: 'c3', repId: 'r1', repName: 'Alex Johnson', title: 'Northwind follow-up', overallScore: 57, weakestSkill: 'Discovery', createdAt: daysAgo(3) },
  ],
  openAssignments: [
    { assignmentId: 'a1', repId: 'r2', repName: 'Sam Rivera', title: 'Closing practice', status: 'overdue', dueAt: daysAgo(2), priority: 'high' },
    { assignmentId: 'a2', repId: 'r1', repName: 'Alex Johnson', title: 'Objection handling drill', status: 'overdue', dueAt: daysAgo(1), priority: 'high' },
    { assignmentId: 'a3', repId: 'r1', repName: 'Alex Johnson', title: 'Budget objection sparring', status: 'open', dueAt: daysAhead(3), priority: 'medium' },
  ],
  weakestSkills: [
    { skill: 'Objection handling', count: 14, averageScore: 58, previousAverageScore: 66, delta: -8, trend: 'down' },
    { skill: 'Closing', count: 9, averageScore: 64, previousAverageScore: 62, delta: 2, trend: 'flat' },
  ],
  coachingImpact: { completedAssignments: 4, skillsImproving: 1, skillsDeclining: 1, summary: '4 drills completed; 1 skill improving, 1 declining.' },
  roi: { callsReviewed: 31, estimatedMinutesSaved: 620, estimatedHoursSaved: 10 },
}

const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

export async function mockManagerApi(page: Page, opts: { empty?: boolean } = {}) {
  await page.route('**/api/proxy/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/v1/team/members')) {
      return route.fulfill(json({
        ok: true,
        items: opts.empty ? [] : REPS.map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, manager_id: null, office_id: r.office, office_name: r.office, scope: r.office ? 'office' : 'company', identity: 'rep', warnings: r.office ? [] : ['no_office_assigned'] })),
        seats: { allocated: 8, used: 5, available: 3, source: 'company_licences' },
        warnings: [],
      }))
    }
    if (url.includes('/v1/manager/command-centre')) return route.fulfill(json(opts.empty ? { ...COMMAND_CENTRE, teamHealth: { ...COMMAND_CENTRE.teamHealth, status: 'green', callsNeedingReview: 0, overdueAssignments: 0, openAssignments: 0 }, repsNeedingAttention: [], callsNeedingReview: [], openAssignments: [], weakestSkills: [] } : COMMAND_CENTRE))
    if (url.includes('/v1/dashboard/leaderboard')) {
      const d = url.includes('days=30') ? 'avg30' : 'avg90'
      return route.fulfill(json({ ok: true, reps: REPS.filter((r) => r[d] != null).map((r, i) => ({ repId: r.id, name: r.name, calls: r.calls, avgScore: r[d], xp: 0, rank: i + 1 })) }))
    }
    if (url.includes('/v1/crm/manager/control-centre')) return route.fulfill(json({ ok: true, headline: { reps_total: 5, reps_at_risk: 1, reps_watch: 1, overdue_actions_total: 2, open_actions_total: 6, window_days: 7 }, reps_all: [] }))
    if (url.includes('/v1/admin/config') || url.includes('/v1/reps/me')) return route.fulfill(json({ ok: true, is_manager: true, tier: 'manager' }))
    return route.fulfill(json({ ok: true, items: [], assignments: [], calls: [] }))
  })
}

// GET /v1/manager/review-queue — shape of the live endpoint. The last item has no resolvable rep:
// the API sends "Unknown rep" and a bare UUID as repId, which must never reach the screen.
export const ORPHAN_REP_ID = '278be53c-0528-4b67-b114-a4e815ba8be6'
export const REVIEW_QUEUE = {
  ok: true,
  windowDays: 30,
  reviewHistoryAvailable: true,
  count: 4,
  items: [
    { callId: 'c1', repId: 'r1', repName: 'Alex Johnson', title: 'Acme discovery call', overallScore: 48, weakestSkill: 'Objection handling', createdAt: daysAgo(0), reasons: ['Score below 70', 'Objection handling below 50'] },
    { callId: 'c3', repId: 'r1', repName: 'Alex Johnson', title: 'Northwind follow-up', overallScore: 57, weakestSkill: 'Discovery', createdAt: daysAgo(5), reasons: ['Score below 70'] },
    { callId: 'c2', repId: 'r2', repName: 'Sam Rivera', title: 'TechFlow demo', overallScore: 63, weakestSkill: 'Closing', createdAt: daysAgo(1), reasons: ['Closing below 50'] },
    { callId: 'c9', repId: ORPHAN_REP_ID, repName: 'Unknown rep', title: 'Orbit renewal', overallScore: 66, weakestSkill: 'Unknown', createdAt: daysAgo(9), reasons: ['Flagged for manager review'] },
  ],
}
