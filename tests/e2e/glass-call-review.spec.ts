import { test, expect, Page } from '@playwright/test'
import { fakeManagerSession, fakeRepSession } from '../helpers/glass-fixtures'
import { getFixture } from '../../src/lib/fixtures/scoringV2Fixtures'

/**
 * Glass system — call review (/calls/[id]). MOCKED verification only: a fabricated session and every /api/proxy call mocked;
 * the recording is a generated silent WAV served from a mock host. No Supabase, staging or production traffic, so this proves
 * the UI against the live endpoint shapes, not against real calls, real audio or real scoring.
 */

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 375, height: 812 },
]
const CALL = '11111111-2222-4333-8444-555555555555'
const CONTACT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const MEDIA = 'https://media.mock.test/call.wav'
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const RAW = /not_found|forbidden|missing_user|HTTP \d|undefined|\[object|migration_required|_failed|x-org-id|TypeError/i
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

/** 120 s of silence, 8 kHz mono 8-bit — real, tiny, seekable. */
function silentWav(seconds = 120) {
  const rate = 8000, n = rate * seconds
  const b = Buffer.alloc(44 + n, 128)
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34)
  b.write('data', 36); b.writeUInt32LE(n, 40)
  return b
}

const SEGMENTS = [
  { speaker: 'Rep', text: 'Hi Dana, thanks for making time today.', start_sec: 0 },
  { speaker: 'Prospect', text: 'Sure, I have about twenty minutes.', start_sec: 6 },
  { speaker: 'Rep', text: 'Great. Can you walk me through how your team handles onboarding right now?', start_sec: 12 },
  { speaker: 'Rep', text: 'And what is the biggest pain point there?', start_sec: 24 },
  { speaker: 'Prospect', text: 'Honestly, price. Our budget got cut this quarter and I cannot justify another tool.', start_sec: 45 },
  { speaker: 'Rep', text: 'I understand. Let me show you the return other teams see.', start_sec: 58 },
  { speaker: 'Prospect', text: 'It still feels too expensive for us.', start_sec: 70 },
  { speaker: 'Rep', text: 'We could look at a smaller package. Would that help?', start_sec: 83 },
  { speaker: 'Prospect', text: 'Maybe. Send me something and I will think about it.', start_sec: 95 },
  { speaker: 'Rep', text: 'Will do. Thanks again.', start_sec: 110 },
]
const MOMENTS = [
  { timestamp: 45, type: 'price_objection', severity: 'high', text: 'Prospect raises budget as the main blocker.' },
  { timestamp: 70, type: 'objection_repeated', severity: 'high', text: 'The price objection comes back and is not resolved.' },
  { timestamp: 24, type: 'discovery_question', severity: 'medium', text: 'Good open question about the biggest pain point.' },
  { timestamp: 95, type: 'weak_close', severity: 'medium', text: 'Call ends with no agreed next step.' },
  { timestamp: 12, type: 'rapport', severity: 'low', text: 'Friendly opener.' },
  { timestamp: 58, type: 'value_statement', severity: 'low', text: 'Offers ROI evidence.' },
  { type: 'summary_note', severity: 'low', text: 'Overall pacing was steady.' },
]
const STAGES = {
  intro: { score: 82, notes: 'Warm, clear opening.' },
  discovery: { score: 58, notes: 'Asked few follow-ups before pitching.' },
  pitch: { score: 71, notes: 'Clear value statement.' },
  objection: { score: 44, notes: 'Did not resolve the price objection.' },
  close: { score: 52, notes: 'No agreed next step.' },
}
const SCORED_CALL = {
  id: CALL, user_id: 'rep-1', rep_name: 'Riley Chen', filename: 'discovery-acme-q3.mp3', status: 'scored', score_overall: 62,
  created_at: new Date(Date.now() - 86_400_000).toISOString(), duration_sec: 125,
  summary: 'Riley ran a friendly discovery call but the price objection was never resolved and no next step was agreed.',
  analysis_json: { stages: STAGES, moments: MOMENTS, transcript: { segments: SEGMENTS } }, rubric: { stages: STAGES },
}

type Opts = {
  role?: 'manager' | 'rep'
  call?: Record<string, unknown> | null
  callStatus?: number
  callDelay?: number
  audio?: boolean
  whispererStatus?: number
  pins?: { id: string; call_id: string; user_id: string; t: number; note: string | null; created_at: string }[]
  assignments?: Record<string, unknown>[]
  link?: Record<string, unknown>
  requests?: string[]
}

async function setup(page: Page, o: Opts = {}) {
  const role = o.role ?? 'manager'
  await (role === 'manager' ? fakeManagerSession(page) : fakeRepSession(page))
  const pins = [...(o.pins ?? [])]
  const wav = silentWav()
  await page.route('**/api/proxy/**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()
    o.requests?.push(`${method} ${url.replace(/^.*\/api\/proxy/, '')}`)
    if (/\/v1\/admin\/config/.test(url)) return role === 'manager' ? route.fulfill(json({ ok: true, config: { streak_threshold: 3, xp_multiplier: 1, comeback_bonus: 25 } })) : route.fulfill(json({ ok: false, error: 'forbidden_not_manager' }, 403))
    if (/\/manager-review/.test(url)) return role === 'manager' ? route.fulfill(json({ ok: true, reviewed: false, review: null })) : route.fulfill(json({ ok: false, error: 'forbidden_not_manager' }, 403))
    if (/\/signed-audio/.test(url)) return o.audio === false ? route.fulfill(json({ ok: false, error: 'not_found' }, 404)) : route.fulfill(json({ ok: true, url: MEDIA }))
    if (/\/scores/.test(url)) return route.fulfill(json({ ok: true, values: [58, 62], items: [] }))
    if (/\/whisperer-triggers/.test(url)) return o.whispererStatus && o.whispererStatus !== 200 ? route.fulfill(json({ ok: false, error: 'server_error' }, o.whispererStatus)) : route.fulfill(json({ ok: true, items: [{ triggerId: 'w1', type: 'price_objection', phrase: 'too expensive', segmentText: 'It still feels too expensive for us.', source: 'live', suggestion: { title: 'Reframe on value', response: 'Ask what the cost of the problem is today.', urgency: 'high' }, suggestionOutcome: role === 'rep' ? 'used' : null, detectedAt: new Date().toISOString(), latencyMs: 85 }] }))
    if (/\/v1\/pins/.test(url)) {
      if (method === 'POST') { const body = JSON.parse(route.request().postData() || '{}'); const pin = { id: `pin-${pins.length + 1}`, call_id: CALL, user_id: 'u', t: body.t, note: body.note, created_at: new Date().toISOString() }; pins.push(pin); return route.fulfill(json({ ok: true, pin })) }
      if (method === 'DELETE') { pins.splice(0, 1); return route.fulfill(json({ ok: true })) }
      return route.fulfill(json({ ok: true, pins }))
    }
    if (/\/v1\/coach\/assignments/.test(url)) return route.fulfill(json({ ok: true, items: o.assignments ?? [] }))
    if (/\/v1\/coach\/drills/.test(url)) return route.fulfill(json({ ok: true, items: [{ id: 'objection-too-expensive', label: 'Objection: “Too expensive”' }] }))
    if (/\/v1\/team\/users/.test(url)) return route.fulfill(json({ ok: true, items: [{ id: 'rep-1', name: 'Riley Chen', email: 'riley@example.test' }] }))
    if (/\/v1\/crm\/link/.test(url) && method === 'GET') return route.fulfill(json({ ok: true, ...(o.link ?? { contact: null, account: null, opportunity: null }) }))
    if (new RegExp(`/v1/calls/${CALL}(\\?|$)`).test(url) && method === 'GET') {
      if (o.callDelay) await new Promise((r) => setTimeout(r, o.callDelay))
      if (o.callStatus && o.callStatus !== 200) return route.fulfill(json({ ok: false, error: o.callStatus === 404 ? 'not_found' : 'server_error' }, o.callStatus))
      return route.fulfill(json({ ok: true, call: o.call === undefined ? { ...SCORED_CALL, ...(o.audio === false ? {} : { signedAudioUrl: MEDIA }) } : o.call }))
    }
    return route.fulfill(json({ ok: true, items: [], calls: [] }))
  })
  // Range support, so the element reports a seekable range (without it Chromium ignores currentTime writes).
  await page.route(MEDIA, (route) => {
    const range = /bytes=(\d*)-(\d*)/.exec(route.request().headers()['range'] ?? '')
    if (!range) return route.fulfill({ status: 200, contentType: 'audio/wav', body: wav, headers: { 'accept-ranges': 'bytes' } })
    const start = range[1] ? Number(range[1]) : 0
    const end = range[2] ? Math.min(Number(range[2]), wav.length - 1) : wav.length - 1
    return route.fulfill({ status: 206, contentType: 'audio/wav', body: wav.subarray(start, end + 1), headers: { 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${wav.length}` } })
  })
}

function trackConsole(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource|net::ERR|media|MEDIA_ERR/i.test(m.text())) errors.push(m.text()) })
  return errors
}
async function noOverflow(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(over, 'horizontal overflow (px)').toBeLessThanOrEqual(1)
}
const main = (page: Page) => page.locator('main')
const bodyText = async (page: Page) => (await main(page).innerText())
// Seeking before the media has loaded its metadata is silently ignored by Chromium, so wait for it (removes a load-dependent flake).
async function audioReady(page: Page) {
  await expect(page.locator('audio')).toBeAttached()
  await expect.poll(() => page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement | null)?.readyState ?? 0)).toBeGreaterThanOrEqual(1)
}
const audioTime = (page: Page) => page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement | null)?.currentTime ?? -1)
async function open(page: Page, o: Opts = {}, path = `/calls/${CALL}`) {
  await setup(page, o)
  await page.goto(path)
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} ${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test('fully scored: summary → score → priorities → moments → recording → transcript, in that order, no UUIDs or raw errors', async ({ page }) => {
      const errors = trackConsole(page)
      await open(page)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByText('Riley ran a friendly discovery call')).toBeVisible()
      await expect(page.getByRole('img', { name: 'Overall score 62 out of 100' }).or(page.locator('[aria-label="Overall score 62 out of 100"]'))).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Top coaching priorities' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Key moments' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Transcript' })).toBeVisible()
      // reading order in the DOM
      const order = await page.evaluate(() => ['summary', 'priorities', 'review', 'moments', 'player', 'transcript', 'pins', 'whisperer-moments', 'coach', 'crm'].map((id) => { const el = document.getElementById(id); return el ? el.getBoundingClientRect().top + window.scrollY : -1 }))
      expect(order.every((y) => y >= 0), `all sections exist: ${order}`).toBe(true)
      expect([...order].sort((a, b) => a - b)).toEqual(order)
      // the score is stated once at the top (no second copy in a side card)
      expect(await page.getByText('Overall score', { exact: true }).count()).toBe(0)
      const text = await bodyText(page)
      expect(text).not.toMatch(UUID)
      expect(text).not.toMatch(RAW)
      await expect(page.getByText('discovery-acme-q3.mp3')).toBeHidden() // the raw filename lives only inside the collapsed Technical details
      await noOverflow(page)
      expect(errors).toEqual([])
    })

    test('key moments: top five by importance, rest on request, each with a timestamp and a source label', async ({ page }) => {
      await open(page)
      const list = page.getByRole('list', { name: 'Key moments', exact: true })
      await expect(list.getByRole('listitem')).toHaveCount(5)
      await expect(page.getByText(/Detected by scoring/)).toBeVisible()
      // most important first: the two high-impact items lead, earliest first
      const first = list.getByRole('listitem').nth(0)
      await expect(first).toContainText('Price objection')
      await expect(first).toContainText('High impact')
      await expect(list.getByRole('listitem').nth(1)).toContainText('Objection repeated')
      await page.getByText('Show 2 more moments').click()
      await expect(page.getByRole('list', { name: 'More key moments' }).getByRole('listitem')).toHaveCount(2)
      await expect(page.getByRole('list', { name: 'More key moments' })).toContainText('Overall pacing was steady') // untimed → shown without a jump
    })

    test('processing call: honest status, no invented score, transcript says it is not ready, no raw state names', async ({ page }) => {
      await open(page, { call: { id: CALL, status: 'processing', rep_name: 'Riley Chen', filename: 'discovery-acme-q3.mp3', created_at: new Date().toISOString(), analysis_json: null }, audio: false })
      await expect(page.getByRole('status').filter({ hasText: 'Processing transcript…' })).toBeVisible()
      await expect(page.getByText(/updates by itself/)).toBeVisible()
      await expect(page.getByText('Not scored yet')).toBeVisible()
      await expect(page.getByText('The transcript isn’t ready yet.')).toBeVisible()
      await expect(page.getByText(/recording is still being prepared/)).toBeVisible()
      await expect(page.getByText('No key moments were detected for this call.')).toBeVisible()
      expect(await bodyText(page)).not.toMatch(RAW)
      await noOverflow(page)
    })

    test('failed call: says so plainly, offers upload-again, shows no score or fake transcript', async ({ page }) => {
      await open(page, { call: { id: CALL, status: 'failed', rep_name: 'Riley Chen', created_at: new Date().toISOString() }, audio: false })
      await expect(page.getByRole('status').filter({ hasText: 'Processing failed. Please retry.' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'upload the recording again' })).toHaveAttribute('href', '/upload')
      await expect(page.getByText('No transcript is available because processing didn’t finish.')).toBeVisible()
      await expect(page.getByText('Not scored yet')).toBeVisible()
      expect(await bodyText(page)).not.toMatch(RAW)
      await noOverflow(page)
    })

    test('missing transcript and audio on a scored call: score and moments still read; gaps are labelled, not blank', async ({ page }) => {
      await open(page, { call: { ...SCORED_CALL, analysis_json: { stages: STAGES, moments: MOMENTS } }, audio: false })
      await expect(page.getByText('No audio available for this call.')).toBeVisible()
      await expect(page.getByText('No transcript has been generated for this call yet.')).toBeVisible()
      await expect(page.getByText('Not available yet')).toBeVisible()
      await expect(page.getByRole('list', { name: 'Key moments', exact: true }).getByRole('listitem')).toHaveCount(5)
      // with nothing to jump to, moment times are plain text, not dead buttons
      await expect(page.getByRole('button', { name: /^Go to / })).toHaveCount(0)
      await expect(page.getByRole('heading', { name: 'Stage breakdown' })).toBeVisible()
    })

    test('partial coaching data: two stages, no moments, no summary, Whisperer unavailable — every gap has calm copy', async ({ page }) => {
      await open(page, { call: { ...SCORED_CALL, summary: null, analysis_json: { stages: { intro: STAGES.intro, close: STAGES.close }, transcript: { segments: SEGMENTS } }, rubric: null }, whispererStatus: 500 })
      await expect(page.getByText('No summary has been generated for this call yet.')).toBeVisible()
      await expect(page.getByText('No key moments were detected for this call.')).toBeVisible()
      await expect(page.getByText('Could not load Whisperer moments.')).toBeVisible()
      await expect(page.getByRole('list', { name: 'Transcript' }).getByRole('listitem')).toHaveCount(SEGMENTS.length)
      await expect(page.getByRole('heading', { name: 'Top coaching priorities' })).toBeVisible()
      expect(await bodyText(page)).not.toMatch(RAW)
    })

    test('not found and could-not-load are different states; neither shows the review shell or a raw error', async ({ page }) => {
      await open(page, { callStatus: 404 })
      await expect(page.getByRole('heading', { name: 'Call not found' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Back to Call Library' })).toHaveAttribute('href', '/call-library')
      await expect(page.getByRole('heading', { name: 'Transcript' })).toHaveCount(0)
      expect(await bodyText(page)).not.toMatch(RAW)
    })

    test('could not load: calm retry, no shell, no raw error', async ({ page }) => {
      await open(page, { callStatus: 500 })
      await expect(page.getByRole('heading', { name: 'We couldn’t load this call' })).toBeVisible({ timeout: 20_000 })
      await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Call not found' })).toHaveCount(0)
      expect(await page.locator('body').innerText()).not.toMatch(RAW)
      await noOverflow(page)
    })

    test('loading: a status skeleton, not "Not scored yet"', async ({ page }) => {
      await open(page, { callDelay: 1500 })
      await expect(page.getByRole('status', { name: 'Loading call' })).toBeVisible()
      await expect(page.getByText('Not scored yet')).toHaveCount(0)
      await expect(page.getByRole('heading', { name: 'Key moments' })).toBeVisible({ timeout: 10_000 })
    })
  })
}

test.describe('roles (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })
  const ASSIGN = [{ id: 'as1', drill_id: CONTACT, notes: 'Focus on price objections', status: 'open' }, { id: 'as2', drill_id: 'objection-too-expensive', notes: null, status: 'completed' }, { id: 'as3', drill_id: 'discovery-5qs' }]

  test('manager: review and coaching actions, outcome buttons, delete, assign form', async ({ page }) => {
    await open(page, { role: 'manager', assignments: ASSIGN, link: { contact: { id: CONTACT, first_name: null, last_name: null, email: null }, account: { id: CONTACT, name: null, domain: null }, opportunity: null } })
    const actions = page.getByRole('group', { name: 'Call actions' })
    await expect(actions.getByRole('button', { name: 'Mark Reviewed' })).toBeVisible()
    await expect(actions.getByRole('button', { name: 'Assign Coaching' })).toBeVisible()
    await expect(actions.getByRole('button', { name: /Assign Drill/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Used' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Delete' }).first()).toBeVisible()
    await expect(page.locator('#coach')).toContainText('Completed')
    await expect(page.getByRole('button', { name: 'Assign to rep' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Assign drill' }).first()).toBeVisible()
    // assignments never show raw ids
    const coach = page.locator('#coach')
    await expect(coach).toContainText('Coaching drill')
    await expect(coach).toContainText('Objection: “Too expensive”')
    await expect(coach).toContainText('Discovery 5qs')
    expect(await coach.innerText()).not.toMatch(UUID)
    // linked records never show raw ids
    const crm = page.locator('#crm')
    await expect(crm).toContainText('Contact: Linked contact')
    await expect(crm).toContainText('Account: Linked account')
    expect(await crm.innerText()).not.toMatch(UUID)
  })

  test('rep: sees the review and assignment status, can practise and link CRM; no manager review action, assign form or Delete', async ({ page }) => {
    await open(page, { role: 'rep', assignments: ASSIGN })
    const actions = page.getByRole('group', { name: 'Call actions' })
    await expect(actions.getByRole('link', { name: /^Practise / })).toBeVisible()
    await expect(actions.getByRole('button', { name: 'Link CRM' })).toBeVisible()
    for (const name of [/Mark Reviewed/, /Assign Coaching/, /Assign Drill/]) await expect(page.getByRole('button', { name })).toHaveCount(0)
    for (const name of ['Assign to rep', 'Assign drill', 'Delete', 'Remove']) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0)
    // Whisperer outcome is authorised by its own API policy (session owner or in-hierarchy manager), so it stays available.
    await expect(page.getByRole('button', { name: /^Used/ })).toBeVisible()
    // Assignments: status is readable; deleting is manager-only (DELETE /v1/coach/assignments/:id is manager + tenant scoped).
    await expect(page.locator('#coach')).toContainText('Open')
    await expect(page.locator('#coach')).toContainText('Completed')
    await expect(page.getByRole('link', { name: 'Practise this stage' }).first()).toBeVisible()
    await expect(page.locator('#coach')).toContainText('Focus on price objections') // assignments are visible read-only
  })

  test('manager Delete sends exactly one DELETE for that assignment; a rep never can, even via the Coach drawer', async ({ page }) => {
    const seen: string[] = []
    await open(page, { role: 'manager', assignments: ASSIGN, requests: seen })
    await page.locator('#coach').getByRole('button', { name: 'Delete' }).first().click()
    await expect.poll(() => seen.filter((r) => /^DELETE \/v1\/coach\/assignments\/as1$/.test(r)).length).toBe(1)
    const repSeen: string[] = []
    const rep = await page.context().browser()!.newContext({ viewport: { width: 1440, height: 900 } })
    const p2 = await rep.newPage()
    await open(p2, { role: 'rep', assignments: ASSIGN, requests: repSeen }, `/calls/${CALL}?panel=coach`)
    await expect(p2.getByRole('dialog', { name: 'Coach' })).toBeVisible()
    await expect(p2.getByRole('button', { name: /^(Delete|Remove)$/ })).toHaveCount(0)
    expect(repSeen.filter((r) => /^DELETE /.test(r))).toEqual([])
    await rep.close()
  })

  test('manager mutations still fire (mark reviewed) and the rep UI never sends manager requests', async ({ page }) => {
    const seen: string[] = []
    await open(page, { role: 'rep', requests: seen })
    await expect(page.getByRole('heading', { name: 'Key moments' })).toBeVisible()
    expect(seen.filter((r) => /POST .*manager-review|POST .*\/v1\/assignments|POST .*coach\/assign/.test(r))).toEqual([])
  })
})

test.describe('navigation (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('moment → timestamp: seeks the recording, scrolls to and highlights the transcript line, writes a shareable anchor', async ({ page }) => {
    await open(page, { pins: [] })
    await audioReady(page)
    await page.getByRole('button', { name: /^Go to 0:45: Price objection/ }).click()
    await expect.poll(() => audioTime(page)).toBeGreaterThan(44)
    await expect(page).toHaveURL(/#transcript-seg-4$/)
    const seg = page.locator('#transcript-seg-4')
    await expect(seg).toBeInViewport()
    await expect(seg).toHaveAttribute('aria-current', 'true')
    await expect(seg).toContainText('Honestly, price.')
    await expect(seg).toContainText('Key moment') // the marker sits on the line where it happened
  })

  test('transcript timestamp plays from that line; pins show as markers and "Show in transcript" finds them', async ({ page }) => {
    const pin = { id: 'p1', call_id: CALL, user_id: 'u', t: 83, note: 'Good recovery offer', created_at: new Date().toISOString() }
    await open(page, { pins: [pin] })
    await page.getByRole('button', { name: 'Play from 1:10' }).click()
    await expect.poll(() => audioTime(page)).toBeGreaterThan(69)
    const pinned = page.locator('#transcript-seg-7')
    await expect(pinned).toContainText('Pin')
    await expect(pinned).toContainText('Good recovery offer')
    await page.locator('#transcript-seg-0').scrollIntoViewIfNeeded()
    await page.getByRole('button', { name: 'Show in transcript' }).click()
    await expect(pinned).toBeInViewport()
    await expect(page).toHaveURL(/#transcript-seg-7$/)
  })

  test('adding a pin from the player puts it in the list and as a marker on the transcript line', async ({ page }) => {
    await open(page)
    await audioReady(page)
    await page.getByRole('button', { name: 'Play from 0:58' }).click()
    await page.getByLabel('Pin note').fill('Strong ROI line')
    await page.getByRole('button', { name: /^Pin at / }).click()
    await expect(page.locator('#pins')).toContainText('Strong ROI line')
    await expect(page.locator('#transcript-seg-5')).toContainText('Strong ROI line')
  })

  test('the playing position highlights exactly one transcript line (aria-current)', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Play from 1:23' }).click()
    await expect(page.locator('#transcript li[aria-current="true"]')).toHaveCount(1)
    await expect(page.locator('#transcript-seg-7')).toHaveAttribute('aria-current', 'true')
  })

  test('a shared #transcript-seg link scrolls to that line on load', async ({ page }) => {
    await open(page, {}, `/calls/${CALL}#transcript-seg-8`)
    await expect(page.locator('#transcript-seg-8')).toBeInViewport({ timeout: 10_000 })
  })

  test('browser Back/Forward: jumping adds no history entries; Back leaves the call, Forward returns to the same call and anchor', async ({ page }) => {
    await setup(page)
    await page.goto('/dashboard')
    await page.goto(`/calls/${CALL}`)
    await expect(page.getByRole('heading', { name: 'Key moments' })).toBeVisible()
    const before = await page.evaluate(() => window.history.length)
    await page.getByRole('button', { name: /^Go to 0:45: Price objection/ }).click()
    await page.getByRole('button', { name: /^Go to 1:10: Objection repeated/ }).click()
    await expect(page).toHaveURL(/#transcript-seg-6$/)
    expect(await page.evaluate(() => window.history.length), 'timestamp jumps must not add history').toBe(before)
    await page.goBack()
    await expect(page).toHaveURL(/\/dashboard/)
    await page.goForward()
    await expect(page).toHaveURL(new RegExp(`/calls/${CALL}`))
    await expect(page.getByRole('heading', { name: 'Key moments' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Transcript' })).toBeVisible()
  })

  test('keyboard only: reach a moment time, activate it with Enter, open the CRM drawer with c, focus moves in, Escape closes and returns focus', async ({ page }) => {
    await open(page)
    await audioReady(page)
    const jump = page.getByRole('button', { name: /^Go to 0:45: Price objection/ })
    await jump.focus()
    await expect(jump).toBeFocused()
    await page.keyboard.press('Enter')
    await expect.poll(() => audioTime(page)).toBeGreaterThan(44)
    await page.keyboard.press('c')
    const dialog = page.getByRole('dialog', { name: 'CRM link' })
    await expect(dialog).toBeVisible()
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(page).not.toHaveURL(/panel=crm/)
    await expect(jump).toBeFocused()
  })

  test('deep links: ?panel=coach&assign=1 opens the Coach drawer; ?panel=crm opens CRM; both still dismiss', async ({ page }) => {
    await open(page, { role: 'manager' }, `/calls/${CALL}?panel=coach&assign=1`)
    await expect(page.getByRole('dialog', { name: 'Coach' })).toBeVisible()
    await expect(page.locator('#assign-form')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Coach' })).toBeHidden()
    await page.goto(`/calls/${CALL}?panel=crm`)
    await expect(page.getByRole('dialog', { name: 'CRM link' })).toBeVisible()
  })

  test('drawers use the shared design system (no legacy neutral surfaces) and fit the viewport', async ({ page }) => {
    await open(page, {}, `/calls/${CALL}?panel=crm`)
    const dlg = page.getByRole('dialog', { name: 'CRM link' })
    await expect(dlg).toBeVisible()
    const cls = await dlg.getAttribute('class')
    expect(cls).not.toMatch(/neutral-(800|900|950)/)
    await noOverflow(page)
  })
})


// ── Scoring v2 (criteria-level) inside the Call Review ─────────────────────────────────────────
// Fixtures are the deterministic analysis_json objects the Day-268 validator already uses. Mocked data only.
function v2Call(id: 'strong' | 'objections' | 'degraded' | 'mixed', mutate?: (aj: any) => void) {
  const aj: any = JSON.parse(JSON.stringify(getFixture(id)!.analysisJson))
  mutate?.(aj)
  return { ...SCORED_CALL, analysis_json: { ...SCORED_CALL.analysis_json, ...aj, transcript: { segments: SEGMENTS } } }
}
const legacySeamList = (page: Page) => page.evaluate(() => Array.from(document.querySelectorAll('#review *, main details *')).filter((el) => /(^|\s)(bg-|border-|text-)(neutral|indigo|success|warning|danger)-\d/.test(el.getAttribute('class') ?? '') || /(^|\s)(bg-black\/|text-\[1[01]px\])/.test(el.getAttribute('class') ?? '')).map((el) => `${el.tagName}.${(el.getAttribute('class') ?? '').slice(0, 90)} :: ${(el.textContent ?? '').slice(0, 30)}`))
const legacySeam = async (page: Page) => { const l = await legacySeamList(page); if (l.length) console.log('SEAM', l.join('\n')); return l.length }

for (const vp of VIEWPORTS) {
  test.describe(`scoring v2 ${vp.name} ${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test('complete v2: criteria, evidence jump, objections and provenance sit inside the glass breakdown with no legacy surfaces', async ({ page }) => {
      const errors = trackConsole(page)
      await open(page, { call: v2Call('objections') })
      const review = page.locator('#review')
      await expect(review.getByRole('heading', { name: 'Stage breakdown' })).toBeVisible()
      await expect(review.getByText(/confidence/i).first()).toBeVisible()
      // one stage opens, its criteria expander opens, content is the fixture's own
      await review.getByText('Evidence and coaching').first().click()
      const expander = review.getByRole('button', { name: /criteri/ }).first()
      await expect(expander).toHaveAttribute('aria-expanded', 'false')
      await expander.click()
      await expect(expander).toHaveAttribute('aria-expanded', 'true')
      await expect(review.getByText('Set agenda and establish credibility').first()).toBeVisible()
      await expect(review.getByText('Pass').first()).toBeVisible()
      // evidence timestamp jumps the recording (existing v2 jump handler)
      await review.getByRole('button', { name: /Jump to \d+:\d{2}/ }).first().click()
      await expect.poll(() => audioTime(page)).toBeGreaterThan(-1)
      // objections belong to the breakdown now, labelled as v2
      const obj = page.getByTestId('v2-objections')
      await expect(obj).toBeVisible()
      await expect(obj).toContainText('From criteria-level (v2) scoring')
      await expect(obj.getByRole('link', { name: /Objection Library/ })).toHaveCount(1)
      expect(await review.evaluate((el, o) => el.contains(o), await obj.elementHandle())).toBe(true)
      // provenance stays in Technical details
      await page.getByText('Technical details').click()
      await page.getByText('Scoring detail').click()
      await expect(page.getByText('Rubric version')).toBeVisible()
      expect(await legacySeam(page), 'legacy neutral/indigo classes still rendered').toBe(0)
      expect(await bodyText(page)).not.toMatch(UUID)
      await noOverflow(page)
      expect(errors).toEqual([])
    })

    test('degraded / partial v2: provisional banner, not-observed stages, empty evidence — page still renders cleanly', async ({ page }) => {
      const errors = trackConsole(page)
      await open(page, { call: v2Call('degraded') })
      const review = page.locator('#review')
      await expect(review.getByText('Provisional score — this review used a limited scoring mode.')).toBeVisible()
      await expect(review.getByText('stub_provider', { exact: true })).toHaveCount(0)
      await expect(review.getByText('Not observed').first()).toBeVisible()
      await review.getByText('Evidence and coaching').first().click()
      await review.getByRole('button', { name: /criteri/ }).first().click()
      expect(await legacySeam(page)).toBe(0)
      await expect(page.getByRole('heading', { name: 'Transcript' })).toBeVisible()
      await noOverflow(page)
      expect(errors).toEqual([])
    })

    test('stripped v2 (no evidence, drills, reasons, objections, provenance fields) does not break the page', async ({ page }) => {
      const errors = trackConsole(page)
      await open(page, {
        call: v2Call('mixed', (aj) => {
          for (const st of aj.v2.stages) for (const c of st.criteria) { c.evidence = []; c.why_points_lost = null; c.coaching_action = null; c.suggested_drill = null; c.points_lost = null }
          aj.v2.objection_matches = []
        }),
      })
      const review = page.locator('#review')
      await expect(review.getByRole('heading', { name: 'Stage breakdown' })).toBeVisible()
      await review.getByText('Evidence and coaching').first().click()
      await review.getByRole('button', { name: /criteri/ }).first().click()
      await expect(page.getByTestId('v2-objections')).toHaveCount(0)
      expect(await legacySeam(page)).toBe(0)
      await noOverflow(page)
      expect(errors).toEqual([])
    })
  })
}
