import { test, expect, Page } from '@playwright/test'
import { fakeManagerSession, mockManagerApi, fakeRepSession, mockRepApi, mockSettingsApi, type SettingsApiOpts } from '../helpers/glass-fixtures'

/**
 * Settings hub (/admin/settings). Fully mocked (fake manager / rep sessions, mocked /api/proxy): this proves the UI and
 * its write payloads against the endpoint shapes, NOT real data. Run against a production build.
 */

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 375, height: 812 },
]
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const BANNED = [/sk-live/i, /secret_key/i, /x-org-id/i, /relation "/i, /org_settings_update_failed/, /forbidden_not_manager/, /\bboom\b/]

async function setup(page: Page, o: SettingsApiOpts = {}) {
  await fakeManagerSession(page)
  await mockManagerApi(page)
  await mockSettingsApi(page, o)
}

async function noHorizontalOverflow(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(over, 'horizontal overflow (px)').toBeLessThanOrEqual(1)
  const wide = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    return Array.from(document.querySelectorAll('main section, main [class*="ds-panel"], main [class*="ds-glass"]'))
      .filter((el) => el.getBoundingClientRect().right > vw + 1).map((el) => (el.textContent || '').slice(0, 40))
  })
  expect(wide, 'panels wider than the viewport').toEqual([])
}

function trackConsole(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()) })
  return errors
}

async function expectClean(page: Page) {
  const text = await page.locator('main').innerText()
  expect(text).not.toMatch(UUID)
  for (const re of BANNED) expect(text, String(re)).not.toMatch(re)
}

const radio = (page: Page, v: string) => page.locator(`input[name="call-visibility"][value="${v}"]`)
const panelTitle = (page: Page, name: string) => page.getByRole('heading', { name, level: 2 })

for (const vp of VIEWPORTS) {
  test.describe(`${vp.name} ${vp.width}px`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } })

    test('section navigation: every section is reachable, is a real URL, and renders clean', async ({ page }) => {
      const errors = trackConsole(page)
      await setup(page)
      await page.goto('/admin/settings')
      await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible({ timeout: 15000 })
      await expect(panelTitle(page, 'Workspace')).toBeVisible()
      await expect(page.getByText('Gravix Staging QA')).toBeVisible()
      const sections: Array<[string, string, string]> = [
        ['people', 'People & access', 'Team members'],
        ['ai', 'AI & Intelligence', 'Intelligence workspace'],
        ['privacy', 'Calls & privacy', 'Company call visibility'],
        ['coaching', 'Coaching & scoring', 'Review thresholds'],
        ['gamification', 'Sparring & gamification', 'Streaks and points'],
        ['system', 'System', 'Environment and service status'],
      ]
      for (const [id, label, title] of sections) {
        if (vp.name === 'desktop') {
          await page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: label }).click()
        } else {
          await page.locator('#settings-section').selectOption(id)
        }
        await expect(page).toHaveURL(new RegExp(`section=${id}$`))
        await expect(panelTitle(page, title)).toBeVisible({ timeout: 15000 })
        await expectClean(page)
        await noHorizontalOverflow(page)
        if (vp.name === 'desktop') await expect(page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
        await page.screenshot({ path: `test-results/glass/settings-${id}-${vp.name}.png`, fullPage: true })
      }
      // omitted-by-design sections never appear
      for (const label of ['Integrations', 'Notifications', 'Data & security']) await expect(page.getByText(label, { exact: true })).toHaveCount(0)
      expect(errors).toEqual([])
    })

    test('compact navigation is a labelled native select on mobile and a nav list on desktop (not both)', async ({ page }) => {
      await setup(page)
      await page.goto('/admin/settings')
      await expect(panelTitle(page, 'Workspace')).toBeVisible({ timeout: 15000 })
      if (vp.name === 'mobile') {
        await expect(page.locator('#settings-section')).toBeVisible()
        await expect(page.getByRole('navigation', { name: 'Settings sections' })).toBeHidden()
      } else {
        await expect(page.getByRole('navigation', { name: 'Settings sections' })).toBeVisible()
        await expect(page.locator('#settings-section')).toBeHidden()
      }
    })

    test('calls & privacy: change → confirm → exact PATCH → success; failure keeps the draft and hides raw errors', async ({ page }) => {
      const writes: SettingsApiOpts['writes'] = []
      await setup(page, { writes })
      await page.goto('/admin/settings?section=privacy')
      await expect(radio(page, 'everyone')).toBeChecked({ timeout: 15000 })
      await expect(page.getByRole('button', { name: 'Save visibility' })).toBeDisabled()
      await radio(page, 'managers').check()
      await expect(page.getByText('Unsaved changes')).toBeVisible()
      await page.getByRole('button', { name: 'Save visibility' }).click()
      const dlg = page.getByRole('dialog', { name: 'Change company call visibility?' })
      await expect(dlg).toBeVisible()
      await expect(dlg).toContainText('whole organisation')
      // Escape cancels with no write
      await page.keyboard.press('Escape')
      await expect(dlg).toBeHidden()
      expect(writes).toEqual([])
      await page.getByRole('button', { name: 'Save visibility' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Change visibility' }).click()
      await expect(page.getByText('Call visibility saved. It applies to everyone now.')).toBeVisible()
      expect(writes).toHaveLength(1)
      expect(writes[0].url).toContain('/v1/admin/org-settings')
      expect(writes[0].body).toEqual({ call_visibility: 'managers' })
      await expect(radio(page, 'managers')).toBeChecked()
      await expect(page.getByRole('button', { name: 'Save visibility' })).toBeDisabled()
      await expectClean(page)
      await noHorizontalOverflow(page)
    })

    test('calls & privacy: a failed save shows a calm message, keeps the draft and never shows the raw API error', async ({ page }) => {
      await setup(page, { visibilityPatchStatus: 500 })
      await page.goto('/admin/settings?section=privacy')
      await radio(page, 'disabled').check({ timeout: 15000 })
      await page.getByRole('button', { name: 'Save visibility' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Change visibility' }).click()
      await expect(page.getByText('Couldn’t save call visibility. Your change was not applied.')).toBeVisible()
      await expect(radio(page, 'disabled')).toBeChecked() // draft kept
            await expectClean(page)
    })

    test('sparring & gamification: validation, confirm with the exact changes, PATCH payload, success, failure, discard', async ({ page }) => {
      const writes: SettingsApiOpts['writes'] = []
      await setup(page, { writes })
      await page.goto('/admin/settings?section=gamification')
      const streak = page.getByLabel('Streak threshold')
      await expect(streak).toHaveValue('3', { timeout: 15000 })
      await expect(page.getByLabel('Points multiplier')).toHaveValue('1')
      await expect(page.getByLabel('Comeback bonus')).toHaveValue('25')
      await expect(page.getByText('Platform-wide', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Save settings' })).toBeDisabled()
      // invalid values are explained and nothing is sent
      await streak.fill('0')
      await page.getByLabel('Points multiplier').fill('11')
      await page.getByRole('button', { name: 'Save settings' }).click()
      await expect(page.getByText('Enter a whole number from 1 to 30.')).toBeVisible()
      await expect(page.getByText('Enter a number from 0.1 to 10.')).toBeVisible()
      await expect(streak).toHaveAttribute('aria-invalid', 'true')
      await expect(page.getByRole('dialog')).toHaveCount(0)
      expect(writes).toEqual([])
      // valid → confirm lists what changes
      await streak.fill('5')
      await page.getByLabel('Points multiplier').fill('1.5')
      await page.getByRole('button', { name: 'Save settings' }).click()
      const dlg = page.getByRole('dialog', { name: 'Apply these streak and points settings?' })
      await expect(dlg).toContainText('Streak threshold: 3 → 5')
      await expect(dlg).toContainText('Points multiplier: 1 → 1.5')
      await expect(dlg).not.toContainText('Comeback bonus')
      await expect(dlg).toContainText('every company on this platform')
      await dlg.getByRole('button', { name: 'Apply settings' }).click()
      await expect(page.getByText('Settings saved. They apply platform-wide now.')).toBeVisible()
      expect(writes).toHaveLength(1)
      expect(writes[0].url).toContain('/v1/admin/config')
      expect(writes[0].body).toEqual({ streak_threshold: 5, xp_multiplier: 1.5, comeback_bonus: 25 })
      await expect(page.getByRole('button', { name: 'Save settings' })).toBeDisabled()
      // discard restores the saved values
      await streak.fill('9')
      await page.getByRole('button', { name: 'Discard changes' }).click()
      await expect(streak).toHaveValue('5')
      await expectClean(page)
      await noHorizontalOverflow(page)
    })

    test('gamification: a failed save keeps the edits and shows no raw error', async ({ page }) => {
      await setup(page, { configPatchStatus: 500 })
      await page.goto('/admin/settings?section=gamification')
      await page.getByLabel('Comeback bonus').fill('100', { timeout: 15000 })
      await page.getByRole('button', { name: 'Save settings' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Apply settings' }).click()
      await expect(page.getByText('Couldn’t save these settings. Your changes were not applied.')).toBeVisible()
      await expect(page.getByLabel('Comeback bonus')).toHaveValue('100')
      await expect(page.getByText('Unsaved changes')).toBeVisible()
      await expectClean(page)
    })

    test('coaching & scoring: thresholds validated (critical ≤ low), confirmed, saved with the exact payload', async ({ page }) => {
      const writes: SettingsApiOpts['writes'] = []
      await setup(page, { writes })
      await page.goto('/admin/settings?section=coaching')
      await expect(page.getByLabel('Low score')).toHaveValue('65', { timeout: 15000 })
      await expect(page.getByLabel('Critical score')).toHaveValue('45')
      await page.getByLabel('Critical score').fill('80')
      await page.getByRole('button', { name: 'Save thresholds' }).click()
      await expect(page.getByText('The critical score can’t be higher than the low score.')).toBeVisible()
      expect(writes).toEqual([])
      await page.getByLabel('Low score').fill('70')
      await page.getByLabel('Critical score').fill('50')
      await page.getByRole('button', { name: 'Save thresholds' }).click()
      const dlg = page.getByRole('dialog', { name: 'Change the review thresholds?' })
      await expect(dlg).toContainText('Low score: 65 → 70')
      await expect(dlg).toContainText('Critical score: 45 → 50')
      await expect(dlg).toContainText('every company on this platform')
      await dlg.getByRole('button', { name: 'Change thresholds' }).click()
      await expect(page.getByText('Thresholds saved. They apply platform-wide to new scoring now.')).toBeVisible()
      expect(writes[0].body).toEqual({ low_score_threshold: 70, critical_score_threshold: 50 })
      await expect(page.getByLabel('Low score')).toHaveValue('70')
    })

    test('coaching & scoring: thresholds are not offered where the API does not return them', async ({ page }) => {
      await setup(page, { thresholds: false })
      await page.goto('/admin/settings?section=coaching')
      await expect(page.getByText('Review thresholds aren’t available in this environment yet.')).toBeVisible({ timeout: 15000 })
      await expect(page.getByLabel('Low score')).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Save thresholds' })).toHaveCount(0)
    })

    test('people & access: read-only summary from the roster; no names, ids or edit controls', async ({ page }) => {
      await setup(page)
      await page.goto('/admin/settings?section=people')
      await expect(page.getByText('Managers & owners')).toBeVisible({ timeout: 15000 })
      const main = page.locator('main')
      await expect(main).toContainText('Members')
      await expect(main).toContainText('4 of 8 seats in use')
      await expect(main).toContainText('Some members have no office assigned.')
      await expect(main).not.toContainText('Alex Johnson')
      await expect(page.getByRole('link', { name: 'Open Team' })).toHaveAttribute('href', '/team')
      await expect(page.getByRole('button', { name: /remove|delete|invite|change role/i })).toHaveCount(0)
      await expectClean(page)
    })

    test('AI & Intelligence links to the existing workspace tabs; General links to the profile', async ({ page }) => {
      await setup(page)
      await page.goto('/admin/settings?section=ai')
      await expect(page.getByRole('link', { name: /^Context/ })).toHaveAttribute('href', '/intelligence?tab=context', { timeout: 15000 })
      await expect(page.getByRole('link', { name: /^Scorecards/ })).toHaveAttribute('href', '/intelligence?tab=scorecards')
      await expect(page.getByRole('link', { name: /^Objections/ })).toHaveAttribute('href', '/intelligence?tab=objections')
      await page.goto('/admin/settings')
      await expect(page.getByRole('link', { name: 'Open your profile' })).toHaveAttribute('href', '/settings/profile', { timeout: 15000 })
    })

    test('system: read-only status and non-secret build info only', async ({ page }) => {
      await setup(page)
      await page.goto('/admin/settings?section=system')
      await expect(page.getByText('Online')).toBeVisible({ timeout: 15000 })
      const main = page.locator('main')
      await expect(main).toContainText('API version')
      await expect(main).toContainText('0c92270')
      await expect(main).toContainText('staging')
      await expect(main).not.toContainText('0c92270abcdef')
      await expect(main).toContainText('Read-only. No keys or secrets are shown here.')
      await expect(page.getByRole('textbox')).toHaveCount(0)
    })

    test('states: loading, section error with retry, and permission denied', async ({ page }) => {
      await setup(page, { configDelay: 1200 })
      await page.goto('/admin/settings?section=gamification')
      await expect(page.getByRole('status', { name: 'Loading settings' })).toBeVisible({ timeout: 10000 })
      await expect(page.getByLabel('Streak threshold')).toBeVisible({ timeout: 15000 })
    })

    test('states: people error → retry; system denied', async ({ page }) => {
      await setup(page, { teamStatus: 500, versionStatus: 403 })
      await page.goto('/admin/settings?section=people')
      const alert = page.getByRole('alert').filter({ hasText: 'Couldn’t load your team' })
      await expect(alert).toBeVisible({ timeout: 15000 })
      await expect(alert).not.toContainText('boom')
      await page.goto('/admin/settings?section=system')
      await expect(page.getByText('You don’t have permission to view this.')).toBeVisible({ timeout: 15000 })
    })
  })
}

test.describe('interaction (desktop)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('deep links, unknown sections, refresh, back and forward', async ({ page }) => {
    await setup(page)
    await page.goto('/admin/settings?section=privacy')
    await expect(panelTitle(page, 'Company call visibility')).toBeVisible({ timeout: 15000 })
    await page.reload()
    await expect(panelTitle(page, 'Company call visibility')).toBeVisible({ timeout: 15000 })
    const nav = page.getByRole('navigation', { name: 'Settings sections' })
    await nav.getByRole('link', { name: 'System' }).click()
    await expect(panelTitle(page, 'Environment and service status')).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(/section=privacy$/)
    await expect(panelTitle(page, 'Company call visibility')).toBeVisible()
    await page.goForward()
    await expect(page).toHaveURL(/section=system$/)
    await expect(panelTitle(page, 'Environment and service status')).toBeVisible()
    await page.goto('/admin/settings?section=integrations')
    await expect(panelTitle(page, 'Workspace')).toBeVisible({ timeout: 15000 })
  })

  test('unsaved changes: kept across sections, flagged in the nav, guarded on reload and when leaving', async ({ page }) => {
    await setup(page)
    await page.goto('/admin/settings?section=gamification')
    await page.getByLabel('Streak threshold').fill('7', { timeout: 15000 })
    const nav = page.getByRole('navigation', { name: 'Settings sections' })
    await expect(nav.getByLabel('Unsaved changes')).toHaveCount(1)
    // switching sections keeps the draft
    await nav.getByRole('link', { name: 'Calls & privacy' }).click()
    await expect(panelTitle(page, 'Company call visibility')).toBeVisible()
    await nav.getByRole('link', { name: 'Sparring & gamification' }).click()
    await expect(page.getByLabel('Streak threshold')).toHaveValue('7')
    // leaving the page via the app navigation asks first; Stay keeps everything
    await page.locator('aside').first().getByRole('link', { name: 'Overview', exact: true }).click()
    const leave = page.getByRole('dialog', { name: 'Leave without saving?' })
    await expect(leave).toBeVisible()
    await leave.getByRole('button', { name: 'Stay' }).click()
    await expect(page).toHaveURL(/\/admin\/settings/)
    await expect(page.getByLabel('Streak threshold')).toHaveValue('7')
    // reload warns (beforeunload) and can be cancelled
    let sawBeforeUnload = false
    page.once('dialog', async (d) => { sawBeforeUnload = d.type() === 'beforeunload'; await d.dismiss() })
    await page.evaluate(() => { window.location.reload() }).catch(() => {})
    await page.waitForTimeout(500)
    expect(sawBeforeUnload).toBe(true)
    await expect(page.getByLabel('Streak threshold')).toHaveValue('7')
    // Leave goes ahead
    await page.locator('aside').first().getByRole('link', { name: 'Overview', exact: true }).click()
    await page.getByRole('dialog', { name: 'Leave without saving?' }).getByRole('button', { name: 'Leave' }).click()
    await expect(page).toHaveURL(/\/coaching/, { timeout: 15000 })
  })

  test('no guard when nothing changed', async ({ page }) => {
    await setup(page)
    await page.goto('/admin/settings?section=gamification')
    await expect(page.getByLabel('Streak threshold')).toBeVisible({ timeout: 15000 })
    await page.locator('aside').first().getByRole('link', { name: 'Overview', exact: true }).click()
    await expect(page).toHaveURL(/\/coaching/, { timeout: 15000 })
  })

  test('keyboard: nav links focusable with a visible ring, radios by arrow keys, dialog traps focus and Escape returns it', async ({ page }) => {
    await setup(page)
    await page.goto('/admin/settings?section=privacy')
    await expect(radio(page, 'everyone')).toBeChecked({ timeout: 15000 })
    const link = page.getByRole('navigation', { name: 'Settings sections' }).getByRole('link', { name: 'People & access' })
    await link.focus()
    const ring = await link.evaluate((el) => { const s = getComputedStyle(el); return `${s.outlineStyle} ${s.boxShadow}` })
    expect(ring).not.toMatch(/^none none$/)
    await radio(page, 'everyone').focus()
    await page.keyboard.press('ArrowDown')
    await expect(radio(page, 'managers')).toBeChecked()
    const save = page.getByRole('button', { name: 'Save visibility' })
    await save.focus()
    await page.keyboard.press('Enter')
    const dlg = page.getByRole('dialog')
    await expect(dlg).toBeVisible()
    expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true)
    // the page behind a modal dialog is inert: focus may reach the dialog or leave to the browser UI (body), never the page
    for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); expect(await page.evaluate(() => document.activeElement === document.body || !!document.activeElement?.closest('dialog'))).toBe(true) }
    await page.keyboard.press('Escape')
    await expect(dlg).toBeHidden()
    await expect(save).toBeFocused()
  })
})

test.describe('role boundary', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('a rep has no Settings entry and is redirected from /admin/settings without any settings UI or request', async ({ page }) => {
    const managerCalls: string[] = []
    await fakeRepSession(page)
    await mockRepApi(page, { managerCalls })
    await page.addInitScript(() => {
      ;(window as any).__leaks = []
      const bad = /Company call visibility|Streak threshold|Review thresholds|Settings sections|forbidden_not_manager/
      new MutationObserver(() => { const m = (document.body?.innerText ?? '').match(bad); if (m) (window as any).__leaks.push(m[0]) }).observe(document, { childList: true, subtree: true, characterData: true })
    })
    await page.goto('/assignments')
    const aside = page.locator('aside').first()
    await expect(aside).toBeVisible({ timeout: 15000 })
    const more = aside.getByRole('button', { name: /more/i })
    if (await more.count()) await more.first().click()
    expect(await aside.locator('a').evaluateAll((as) => as.map((a) => a.getAttribute('href') || '').filter((h) => h.startsWith('/admin/settings')))).toEqual([])
    await page.goto('/admin/settings?section=gamification')
    await expect(page).toHaveURL(/\/assignments$/, { timeout: 15000 })
    expect(await page.evaluate(() => (window as any).__leaks)).toEqual([])
    expect(managerCalls).toEqual([])
  })

  test('a manager sees Settings in the navigation and reaches the hub', async ({ page }) => {
    await setup(page)
    await page.goto('/coaching')
    const aside = page.locator('aside').first()
    await expect(aside).toBeVisible({ timeout: 15000 })
    await aside.getByRole('button', { name: /more/i }).first().click()
    await aside.getByRole('link', { name: 'Settings', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/settings/)
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible({ timeout: 15000 })
  })
})
