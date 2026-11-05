import { test, expect, Page } from '@playwright/test'
import { mkdtempSync, writeFileSync, truncateSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fakeRepSession, mockRepApi } from '../helpers/glass-fixtures'

/**
 * Glass system — /upload. MOCKED verification only: a fabricated session, every /api/proxy call mocked, and the signed
 * storage URL intercepted. No Supabase, staging or production traffic, and no real recordings (files are tiny in-memory
 * buffers). This proves the UI against the live endpoint contracts (signed → PUT → finalize → job/call polling), not the
 * real storage, transcription or scoring services. Real transfer progress is NOT provable through a mocked PUT.
 */

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 375, height: 812 },
]
const CALL_ID = '3f2b8c1e-5a4d-4c9b-8e7f-0a1b2c3d4e5f'
const JOB_ID = '9a8b7c6d-1e2f-4a3b-9c4d-5e6f7a8b9c0d'
const STORAGE = 'https://storage.mock.test/put'
const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })
const RAW = /HTTP \d|storage \d|processing_failed|signed_url_failed|duplicate key|relation "|TypeError|_failed|upload_hierarchy|x-org-id/i

type Mock = {
  signedStatus?: number
  putStatuses?: number[] // consumed in order; last repeats
  putDelay?: number
  finalizeStatuses?: number[]
  finalizeDelay?: number
  accounts?: Array<{ id: string; name: string; domain: string | null }>
  callExistsAfterFinalizeFailure?: boolean
  job?: string[] // job statuses in order; last repeats
  callStatus?: string
  calls: { signed: number; put: number; finalize: number; created: number; job: number; order: string[]; finalizeBody?: Record<string, unknown>; signedBody?: Record<string, unknown> }
}

async function setup(page: Page, o: Partial<Mock> = {}): Promise<Mock> {
  const m: Mock = { calls: { signed: 0, put: 0, finalize: 0, created: 0, job: 0, order: [] }, ...o }
  await fakeRepSession(page)
  await mockRepApi(page, {})
  let finalizeAttempts = 0
  let created = false
  await page.route('**/api/proxy/**', async (route) => {
    const url = route.request().url()
    const method = route.request().method()
    if (url.includes('/v1/accounts') && m.accounts) return route.fulfill(json({ ok: true, accounts: m.accounts }))
    if (url.includes('/v1/upload/signed')) {
      m.calls.signed++; m.calls.order.push('signed'); m.calls.signedBody = JSON.parse(route.request().postData() || '{}')
      if (m.signedStatus && m.signedStatus !== 200) return route.fulfill(json({ ok: false, error: 'signed_url_failed: storage 500' }, m.signedStatus))
      return route.fulfill(json({ ok: true, path: `user-1/${CALL_ID}.wav`, url: `${STORAGE}/${m.calls.signed}`, id: CALL_ID, kind: 'audio' }))
    }
    if (url.includes('/v1/upload/finalize')) {
      m.calls.finalize++; m.calls.order.push('finalize'); m.calls.finalizeBody = JSON.parse(route.request().postData() || '{}')
      if (m.finalizeDelay) await new Promise((r) => setTimeout(r, m.finalizeDelay))
      const st = (m.finalizeStatuses ?? [200])[Math.min(finalizeAttempts++, (m.finalizeStatuses ?? [200]).length - 1)]
      if (st !== 200) { if (m.callExistsAfterFinalizeFailure) created = true; return route.fulfill(json({ ok: false, error: 'DB insert failed: duplicate key value violates unique constraint "calls_pkey"' }, st)) }
      created = true; m.calls.created++
      return route.fulfill(json({ ok: true, callId: CALL_ID, jobId: JOB_ID, accountId: null }))
    }
    if (url.includes(`/v1/jobs/${JOB_ID}`)) {
      const seq = m.job ?? ['succeeded']
      const st = seq[Math.min(m.calls.job++, seq.length - 1)]
      return route.fulfill(json({ ok: true, status: st, job: { id: JOB_ID, status: st, error: st === 'failed' ? 'processing_failed' : null } }))
    }
    if (url.includes(`/v1/calls/${CALL_ID}`) && method === 'GET') {
      if (!created) return route.fulfill(json({ ok: false, error: 'not_found' }, 404))
      return route.fulfill(json({ ok: true, call: { id: CALL_ID, status: m.callStatus ?? 'scored', score_overall: 72 } }))
    }
    return route.fallback()
  })
  await page.route(`${STORAGE}/**`, async (route) => {
    m.calls.put++; m.calls.order.push('put')
    if (m.putDelay) await new Promise((r) => setTimeout(r, m.putDelay))
    const seq = m.putStatuses ?? [200]
    const st = seq[Math.min(m.calls.put - 1, seq.length - 1)]
    return route.fulfill({ status: st, contentType: 'application/json', body: '{}', headers: { 'access-control-allow-origin': '*' } })
  })
  return m
}

function trackConsole(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/favicon|Failed to load resource|net::ERR/.test(msg.text())) errors.push(msg.text())
  })
  return errors
}

async function noHorizontalOverflow(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(over, 'horizontal overflow (px)').toBeLessThanOrEqual(1)
}

const wav = (name = 'discovery-call.wav', size = 2048) => ({ name, mimeType: 'audio/wav', buffer: Buffer.alloc(size, 1) })
const input = (page: Page) => page.getByTestId('upload-input')
const uploadBtn = (page: Page) => page.getByRole('button', { name: 'Upload call', exact: true })

async function fill(page: Page, file = wav()) {
  await input(page).setInputFiles(file)
}

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} ${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test('empty state answers: what file, who sees it, what is required — and Upload is unavailable', async ({ page }) => {
      const errors = trackConsole(page)
      await setup(page)
      await page.goto('/upload')
      await expect(page.getByRole('heading', { level: 1, name: 'Upload a call' })).toBeVisible()
      await expect(page.getByTestId('upload-dropzone')).toBeVisible()
      await expect(page.getByText(/WAV, MP3, M4A, MP4, AAC, OGG, WebM or FLAC audio, or a transcript as JSON/)).toBeVisible()
      await expect(page.getByText(/Up to 50 MB per file/)).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Who can see this call' })).toBeVisible()
      await expect(page.getByTestId('upload-visibility')).toContainText('You can always open calls you upload')
      await expect(page.getByTestId('upload-visibility')).toContainText('People outside your organisation never can')
      await expect(page.getByText(/transcribes and scores it in the background/)).toBeVisible()
      await expect(uploadBtn(page)).toBeDisabled()
      await expect(page.getByTestId('upload-needs')).toHaveText('To upload, add a recording.')
      await expect(page.getByRole('link', { name: 'Back to Calls' })).toHaveAttribute('href', '/call-library')
      await expect(page.getByRole('link', { name: 'Upload history' })).toHaveAttribute('href', '/call-library?tab=upload')
      await noHorizontalOverflow(page)
      expect(errors).toEqual([])
    })

    test('invalid type and oversized file are refused with calm copy and never selected', async ({ page }) => {
      await setup(page)
      await page.goto('/upload')
      await input(page).setInputFiles({ name: 'notes.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(100) })
      await expect(page.getByTestId('upload-file-error')).toContainText('isn’t a supported file type')
      await expect(page.getByTestId('upload-selected')).toHaveCount(0)
      // A sparse 51 MB file on disk (never uploaded — validation refuses it first); Playwright caps in-memory buffers at 50 MB.
      const dir = mkdtempSync(join(tmpdir(), 'gravix-upload-'))
      const big = join(dir, 'huge.wav')
      writeFileSync(big, ''); truncateSync(big, 51 * 1024 * 1024)
      await input(page).setInputFiles(big)
      await expect(page.getByTestId('upload-file-error')).toContainText('The limit is 50 MB')
      await expect(page.getByTestId('upload-selected')).toHaveCount(0)
      await expect(uploadBtn(page)).toBeDisabled()
      await expect(page.getByTestId('upload-needs')).toContainText('add a recording')
      // a valid pick clears the error
      await input(page).setInputFiles(wav())
      await expect(page.getByTestId('upload-file-error')).toHaveCount(0)
      await expect(uploadBtn(page)).toBeEnabled()
    })

    test('selected file shows name and size; Replace and Remove work; an invalid replacement keeps the valid file', async ({ page }) => {
      await setup(page)
      await page.goto('/upload')
      await input(page).setInputFiles(wav('first.wav', 4096))
      await expect(page.getByTestId('upload-selected')).toContainText('first.wav')
      await expect(page.getByTestId('upload-selected')).toContainText('4 KB')
      await input(page).setInputFiles({ name: 'bad.exe', mimeType: 'application/x-msdownload', buffer: Buffer.alloc(10) })
      await expect(page.getByTestId('upload-selected')).toContainText('first.wav')
      await expect(page.getByTestId('upload-file-error')).toBeVisible()
      await input(page).setInputFiles(wav('second.wav', 8192))
      await expect(page.getByTestId('upload-selected')).toContainText('second.wav')
      await page.getByRole('button', { name: 'Remove second.wav' }).click()
      await expect(page.getByTestId('upload-dropzone')).toBeVisible()
    })

    test('the recording is the only required input; there is no rep or ownership selector; ownership and visibility are separate statements', async ({ page }) => {
      await setup(page)
      await page.goto('/upload')
      await expect(uploadBtn(page)).toBeDisabled()
      await expect(page.getByTestId('upload-needs')).toHaveText('To upload, add a recording.')
      await expect(page.getByTestId('upload-ownership')).toHaveText('The call will belong to you, the signed-in uploader.')
      await expect(page.getByTestId('upload-visibility')).toContainText('call-visibility setting')
      await expect(page.getByTestId('upload-visibility')).not.toContainText(/label/i)
      await expect(page.getByRole('heading', { name: 'Who owns this call' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Who can see this call' })).toBeVisible()
      for (const gone of [/^Rep\b/i, /Who is this call for/i, /Call type/i, /Tag \/ campaign/i]) {
        await expect(page.locator("main").getByText(gone)).toHaveCount(0)
      }
      await expect(page.locator('main select, main input[type="text"]')).toHaveCount(0)
      await input(page).setInputFiles(wav())
      await expect(uploadBtn(page)).toBeEnabled()
      await expect(page.getByTestId('upload-needs')).toHaveText('Ready to upload.')
    })

    test('account link is the one optional field and is sent as accountId', async ({ page }) => {
      const m = await setup(page, { accounts: [{ id: '11111111-2222-4333-8444-555555555555', name: 'Acme Ltd', domain: null }] })
      await page.goto('/upload')
      await fill(page)
      await page.getByLabel('Link this call to a client account').selectOption({ label: 'Acme Ltd' })
      await uploadBtn(page).click()
      await expect(page.getByRole('heading', { name: 'Call ready for review.' })).toBeVisible({ timeout: 20_000 })
      expect(m.calls.finalizeBody).toMatchObject({ accountId: '11111111-2222-4333-8444-555555555555' })
    })

    test('success: stages, signed → PUT → finalize order, unchanged finalize contract, ready state with view/return actions', async ({ page }) => {
      const errors = trackConsole(page)
      const m = await setup(page, { job: ['running', 'succeeded'], callStatus: 'scored' })
      await page.goto('/upload')
      await fill(page)
      await uploadBtn(page).click()
      await expect(page.getByRole('heading', { name: 'Call ready for review.' })).toBeVisible({ timeout: 20_000 })
      expect(m.calls.order.slice(0, 3)).toEqual(['signed', 'put', 'finalize'])
      expect(m.calls.signedBody).toEqual({ filename: 'discovery-call.wav', mime: 'audio/wav', size: 2048 })
      expect(m.calls.finalizeBody).toEqual({ path: `user-1/${CALL_ID}.wav`, filename: 'discovery-call.wav', mime: 'audio/wav', size: 2048, accountId: null })
      await expect(page.getByRole('link', { name: 'View call' })).toHaveAttribute('href', `/calls/${CALL_ID}`)
      await expect(page.getByRole('link', { name: 'Back to Calls' })).toHaveAttribute('href', '/call-library')
      await expect(page.getByRole('button', { name: 'Upload another' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Open Review Queue' })).toHaveCount(0) // rep: manager probe answers 403
      await expect(page.getByTestId('upload-heading')).toBeFocused()
      for (const label of ['Preparing', 'Uploading', 'Finalising', 'Processing']) {
        await expect(page.getByRole('list', { name: 'Upload progress' }).getByText(label, { exact: true })).toBeVisible()
      }
      await noHorizontalOverflow(page)
      expect(errors).toEqual([])
    })

    test('upload (storage) failure: calm copy, nothing saved, retry starts a fresh transfer and creates exactly one call', async ({ page }) => {
      const m = await setup(page, { putStatuses: [500, 200] })
      await page.goto('/upload')
      await fill(page)
      await uploadBtn(page).click()
      const alert = page.getByRole('alert').filter({ hasText: 'Nothing was saved' })
      await expect(alert).toBeVisible()
      await expect(page.getByRole('heading', { name: 'The upload didn’t finish' })).toBeVisible()
      expect(await page.locator('main').innerText()).not.toMatch(RAW)
      expect(m.calls.finalize).toBe(0)
      await page.getByRole('button', { name: 'Try again' }).click()
      await expect(page.getByRole('heading', { name: 'Call ready for review.' })).toBeVisible({ timeout: 20_000 })
      expect(m.calls.finalize).toBe(1)
    })

    test('signing failure shows calm copy with no raw code', async ({ page }) => {
      await setup(page, { signedStatus: 500 })
      await page.goto('/upload')
      await fill(page)
      await uploadBtn(page).click()
      await expect(page.getByRole('heading', { name: 'We couldn’t start the upload' })).toBeVisible()
      expect(await page.locator('main').innerText()).not.toMatch(RAW)
    })

    test('finalisation failure: recording is safe, retry does NOT upload again and creates one call', async ({ page }) => {
      // api.ts retries 5xx transparently (3 attempts), so one click = 3 failing finalize calls; the user's retry is the 4th.
      const m = await setup(page, { finalizeStatuses: [500, 500, 500, 200] })
      await page.goto('/upload')
      await fill(page)
      await uploadBtn(page).click()
      await expect(page.getByRole('heading', { name: 'The file arrived, but the call wasn’t created' })).toBeVisible()
      expect(await page.locator('main').innerText()).not.toMatch(RAW)
      await page.getByRole('button', { name: 'Try again' }).click()
      await expect(page.getByRole('heading', { name: 'Call ready for review.' })).toBeVisible({ timeout: 20_000 })
      expect(m.calls.signed).toBe(1)
      expect(m.calls.put).toBe(1)
      expect(m.calls.finalize).toBe(4)
      expect(m.calls.created).toBe(1) // exactly one call
    })

    test('duplicate guard: if the failed finalise had actually created the call, retry adopts it instead of creating another', async ({ page }) => {
      const m = await setup(page, { finalizeStatuses: [500, 500, 500], callExistsAfterFinalizeFailure: true })
      await page.goto('/upload')
      await fill(page)
      await uploadBtn(page).click()
      await expect(page.getByRole('heading', { name: 'The file arrived, but the call wasn’t created' })).toBeVisible()
      const before = m.calls.finalize
      await page.getByRole('button', { name: 'Try again' }).click()
      await expect(page.getByRole('heading', { name: /Call ready for review\.|Call uploaded\. Processing has started\./ })).toBeVisible({ timeout: 20_000 })
      expect(m.calls.finalize).toBe(before) // adopted the existing call: no further finalize
      expect(m.calls.signed).toBe(1)
      expect(m.calls.put).toBe(1)
    })

    test('processing failure: saved message, "Check again" never re-uploads or re-finalises', async ({ page }) => {
      const m = await setup(page, { job: ['failed', 'succeeded'] })
      await page.goto('/upload')
      await fill(page)
      await uploadBtn(page).click()
      await expect(page.getByRole('heading', { name: 'Processing didn’t finish' })).toBeVisible({ timeout: 20_000 })
      await expect(page.getByRole('alert').filter({ hasText: 'Your recording is saved' })).toBeVisible()
      expect(await page.locator('main').innerText()).not.toMatch(RAW)
      await expect(page.getByRole('link', { name: 'See uploads in Calls' })).toHaveAttribute('href', '/call-library?tab=upload')
      await page.getByRole('button', { name: 'Check again' }).click()
      await expect(page.getByRole('heading', { name: 'Call ready for review.' })).toBeVisible({ timeout: 20_000 })
      expect([m.calls.signed, m.calls.put, m.calls.finalize]).toEqual([1, 1, 1])
    })
  })
}

test.describe('behaviour (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('leaving during an active upload asks first; staying keeps the upload; Cancel returns to the form with nothing saved', async ({ page }) => {
    const m = await setup(page, { putDelay: 4000 })
    await page.goto('/upload')
    await fill(page)
    await uploadBtn(page).click()
    await expect(page.getByRole('heading', { name: 'Uploading your call' })).toBeVisible()
    await expect(page.getByText('Keep this page open until the upload finishes')).toBeVisible()
    await expect(page.getByRole('progressbar', { name: 'Upload progress' })).toBeVisible()
    const messages: string[] = []
    page.once('dialog', async (d) => { messages.push(d.message()); await d.dismiss() })
    await page.getByRole('link', { name: 'Back to Calls' }).or(page.getByRole('link', { name: 'Calls' }).first()).first().click({ noWaitAfter: true }).catch(() => {})
    await page.getByRole('link', { name: 'Upload history' }).click({ noWaitAfter: true })
    await expect.poll(() => messages.length).toBeGreaterThan(0)
    expect(messages[0]).toMatch(/upload is still in progress/i)
    await expect(page).toHaveURL(/\/upload$/)
    await page.getByRole('button', { name: 'Cancel upload' }).click()
    await expect(page.getByRole('heading', { name: 'Upload a call' })).toBeVisible()
    await expect(page.getByTestId('upload-selected')).toContainText('discovery-call.wav')
    expect(m.calls.finalize).toBe(0)
  })

  test('beforeunload is armed during upload and disarmed afterwards', async ({ page }) => {
    await setup(page, { putDelay: 3000 })
    await page.goto('/upload')
    await fill(page)
    const armed = async () => page.evaluate(() => {
      const ev = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(ev)
      return ev.defaultPrevented
    })
    expect(await armed()).toBe(false)
    await uploadBtn(page).click()
    await expect(page.getByRole('heading', { name: 'Uploading your call' })).toBeVisible()
    expect(await armed()).toBe(true)
    await expect(page.getByRole('heading', { name: 'Call ready for review.' })).toBeVisible({ timeout: 25_000 })
    expect(await armed()).toBe(false)
  })

  test('refresh during processing resumes the same call — no second upload or call', async ({ page }) => {
    const m = await setup(page, { job: ['running'], callStatus: 'queued' })
    await page.goto('/upload')
    await fill(page)
    await uploadBtn(page).click()
    await expect(page.getByRole('heading', { name: 'Processing the call' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/runs in the background and can take a few minutes/)).toBeVisible()
    expect(await page.locator('main').innerText()).not.toMatch(/\b\d+\s*(seconds?|minutes?)\s*(left|remaining)/i)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Checking on your upload' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('discovery-call.wav').first()).toBeVisible()
    expect([m.calls.signed, m.calls.put, m.calls.finalize]).toEqual([1, 1, 1])
  })

  test('keyboard only: choose a file, fill the form and upload without a mouse; focus lands on the result', async ({ page }) => {
    await setup(page)
    await page.goto('/upload')
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Choose a file' }).focus()
    await page.keyboard.press('Enter')
    await (await chooser).setFiles(wav())
    await expect(page.getByTestId('upload-selected')).toBeVisible()
    for (let i = 0; i < 6 && !(await uploadBtn(page).evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab')
    await expect(uploadBtn(page)).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Call ready for review.' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('upload-heading')).toBeFocused()
  })

  test('drag and drop selects a file; screen-reader structure: labelled fields, one polite status region, named progress list', async ({ page }) => {
    await setup(page, { putDelay: 1500 })
    await page.goto('/upload')
    const dt = await page.evaluateHandle(() => {
      const d = new DataTransfer()
      d.items.add(new File([new Uint8Array(1024)], 'dropped.mp3', { type: 'audio/mpeg' }))
      return d
    })
    await page.getByTestId('upload-dropzone').dispatchEvent('drop', { dataTransfer: dt })
    await expect(page.getByTestId('upload-selected')).toContainText('dropped.mp3')
    expect(await page.locator('main [role="status"][aria-live="polite"]').count()).toBe(1)
    await uploadBtn(page).click()
    await expect(page.getByRole('list', { name: 'Upload progress' })).toBeVisible()
    await expect(page.locator('[aria-current="step"]')).toHaveCount(1)
    await expect.poll(async () => (await page.locator('main [role="status"][aria-live="polite"]').innerText()).length).toBeGreaterThan(0)
  })

  /* ── Browser Back ──────────────────────────────────────────────────────────────────────────────────────────
     Each test starts on /dashboard so there is a real previous page to go Back to. */
  const startOnUpload = async (page: Page) => {
    await page.goto('/dashboard')
    await page.goto('/upload')
  }
  const historyLength = (page: Page) => page.evaluate(() => window.history.length)
  const stageText = (page: Page, label: string) => page.getByRole('list', { name: 'Upload progress' }).locator('li[aria-current="step"]', { hasText: label })

  for (const phase of ['upload', 'finalisation'] as const) {
    test(`Back during ${phase}: asks first; staying keeps the operation and adds no history; confirming leaves in one step with no loop`, async ({ page }) => {
      const m = await setup(page, phase === 'upload' ? { putDelay: 8000 } : { finalizeDelay: 8000 })
      await startOnUpload(page)
      await fill(page)
      await uploadBtn(page).click()
      await expect(stageText(page, phase === 'upload' ? 'Uploading' : 'Finalising')).toBeVisible({ timeout: 10_000 })
      const armedLength = await historyLength(page)

      const messages: string[] = []
      page.on('dialog', async (d) => { messages.push(d.message()); if (messages.length === 1) await d.dismiss(); else await d.accept() })

      // 1st Back → decision shown; Stay
      await page.goBack()
      await expect.poll(() => messages.length).toBe(1)
      expect(messages[0]).toMatch(/upload is still in progress/i)
      await expect(page).toHaveURL(/\/upload$/)
      await expect(stageText(page, phase === 'upload' ? 'Uploading' : 'Finalising')).toBeVisible()
      expect(await historyLength(page), 'staying must not grow history').toBe(armedLength)

      // Back again → same decision, still guarded (re-armed once, no loop); Stay again
      await page.goBack()
      await expect.poll(() => messages.length).toBe(2)
      // (second dialog was accepted by the handler above) → leaves exactly one step, to the previous page
      await expect(page).toHaveURL(/\/dashboard$/)
      expect(messages.length, 'no further prompts after leaving').toBe(2)
      expect(m.calls.finalize).toBeLessThanOrEqual(1)
    })
  }

  test('Back during resumable processing leaves normally with no prompt, and returning resumes the same call', async ({ page }) => {
    const m = await setup(page, { job: ['running'], callStatus: 'queued' })
    await startOnUpload(page)
    await fill(page)
    await uploadBtn(page).click()
    await expect(page.getByRole('heading', { name: 'Processing the call' })).toBeVisible({ timeout: 15_000 })
    const dialogs: string[] = []
    page.on('dialog', async (d) => { dialogs.push(d.message()); await d.dismiss() })
    await page.goBack()
    await expect(page).toHaveURL(/\/dashboard$/) // one Back, straight to the previous page
    expect(dialogs).toEqual([])
    await page.goForward()
    await expect(page).toHaveURL(/\/upload$/)
    await expect(page.getByRole('heading', { name: 'Checking on your upload' })).toBeVisible({ timeout: 15_000 })
    expect([m.calls.signed, m.calls.put, m.calls.finalize]).toEqual([1, 1, 1])
  })

  test('leaving through an in-app link (confirmed) does not stack a duplicate /upload entry', async ({ page }) => {
    await setup(page, { putDelay: 8000 })
    await startOnUpload(page)
    await fill(page)
    await uploadBtn(page).click()
    await expect(stageText(page, 'Uploading')).toBeVisible({ timeout: 10_000 })
    page.once('dialog', (d) => void d.accept())
    await page.getByRole('link', { name: 'Upload history' }).click()
    await expect(page).toHaveURL(/\/call-library\?tab=upload$/)
    await page.goBack()
    await expect(page).toHaveURL(/\/upload$/)
    await page.goBack()
    await expect(page).toHaveURL(/\/dashboard$/)
  })
})
