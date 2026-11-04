// Pure helpers for the Settings hub (admin). No React, no I/O.
// Validation mirrors the API's own rules (PATCH /v1/admin/config, PATCH /v1/admin/org-settings) so a
// bad value is explained before the request; the server remains the authority.

export const SECTIONS = [
  { id: 'general', label: 'General', blurb: 'Your workspace and account' },
  { id: 'people', label: 'People & access', blurb: 'Team members, roles and seats' },
  { id: 'ai', label: 'AI & Intelligence', blurb: 'What Gravix knows about how you sell' },
  { id: 'privacy', label: 'Calls & privacy', blurb: 'Who can see company calls' },
  { id: 'coaching', label: 'Coaching & scoring', blurb: 'When a call needs attention' },
  { id: 'gamification', label: 'Sparring & gamification', blurb: 'Streaks, points and buyer personas' },
  { id: 'system', label: 'System', blurb: 'Environment and service status' },
] as const
export type SectionId = (typeof SECTIONS)[number]['id']

export const parseSection = (v: string | null | undefined): SectionId =>
  (SECTIONS.find((s) => s.id === v)?.id ?? 'general') as SectionId

export type CallVisibility = 'everyone' | 'managers' | 'disabled'
export const VISIBILITY_OPTIONS: Array<{ value: CallVisibility; label: string; description: string }> = [
  { value: 'everyone', label: 'Everyone', description: 'Every team member can open the Company calls view.' },
  { value: 'managers', label: 'Managers only', description: 'Only managers can open the Company calls view. Reps keep their own calls.' },
  { value: 'disabled', label: 'Off', description: 'Nobody can open the Company calls view. Everyone keeps their own calls.' },
]
export const visibilityLabel = (v: CallVisibility | 'unknown') => VISIBILITY_OPTIONS.find((o) => o.value === v)?.label ?? 'Unknown'

/* ── Gamification (streak / points multiplier / comeback bonus) ── */
export type GamificationForm = { streak_threshold: string; xp_multiplier: string; comeback_bonus: string }
export type GamificationValues = { streak_threshold: number; xp_multiplier: number; comeback_bonus: number }

const num = (s: string) => (String(s ?? '').trim() === '' ? NaN : Number(String(s).trim()))
const isInt = (n: number) => Number.isInteger(n)

export function validateGamification(f: GamificationForm): { ok: boolean; errors: Partial<Record<keyof GamificationForm, string>>; values: GamificationValues | null } {
  const errors: Partial<Record<keyof GamificationForm, string>> = {}
  const streak = num(f.streak_threshold)
  const mult = num(f.xp_multiplier)
  const comeback = num(f.comeback_bonus)
  if (!isInt(streak) || streak < 1 || streak > 30) errors.streak_threshold = 'Enter a whole number from 1 to 30.'
  if (!Number.isFinite(mult) || mult < 0.1 || mult > 10) errors.xp_multiplier = 'Enter a number from 0.1 to 10.'
  if (!isInt(comeback) || comeback < 0 || comeback > 5000) errors.comeback_bonus = 'Enter a whole number from 0 to 5000.'
  return Object.keys(errors).length ? { ok: false, errors, values: null } : { ok: true, errors, values: { streak_threshold: streak, xp_multiplier: mult, comeback_bonus: comeback } }
}

export const toGamificationForm = (c: { streak_threshold: number; xp_multiplier: number; comeback_bonus: number }): GamificationForm => ({
  streak_threshold: String(c.streak_threshold),
  xp_multiplier: String(c.xp_multiplier),
  comeback_bonus: String(c.comeback_bonus),
})

export function gamificationDirty(form: GamificationForm, saved: GamificationForm | null): boolean {
  if (!saved) return false
  return (Object.keys(saved) as Array<keyof GamificationForm>).some((k) => num(form[k]) !== num(saved[k]) && !(Number.isNaN(num(form[k])) && Number.isNaN(num(saved[k]))))
}

/* ── Review thresholds (low / critical call score) ── */
export type ThresholdForm = { low_score_threshold: string; critical_score_threshold: string }
export type ThresholdValues = { low_score_threshold: number; critical_score_threshold: number }

export function validateThresholds(f: ThresholdForm): { ok: boolean; errors: Partial<Record<keyof ThresholdForm, string>>; values: ThresholdValues | null } {
  const errors: Partial<Record<keyof ThresholdForm, string>> = {}
  const low = num(f.low_score_threshold)
  const crit = num(f.critical_score_threshold)
  if (!isInt(low) || low < 0 || low > 100) errors.low_score_threshold = 'Enter a whole number from 0 to 100.'
  if (!isInt(crit) || crit < 0 || crit > 100) errors.critical_score_threshold = 'Enter a whole number from 0 to 100.'
  if (!errors.low_score_threshold && !errors.critical_score_threshold && crit > low) errors.critical_score_threshold = 'The critical score can’t be higher than the low score.'
  return Object.keys(errors).length ? { ok: false, errors, values: null } : { ok: true, errors, values: { low_score_threshold: low, critical_score_threshold: crit } }
}

/** The API returns null for the thresholds where its migration has not been applied; then they are not editable. */
export function thresholdsFromConfig(c: { low_score_threshold?: unknown; critical_score_threshold?: unknown } | null | undefined): ThresholdForm | null {
  const low = c?.low_score_threshold
  const crit = c?.critical_score_threshold
  return typeof low === 'number' && typeof crit === 'number' ? { low_score_threshold: String(low), critical_score_threshold: String(crit) } : null
}

export function thresholdsDirty(form: ThresholdForm, saved: ThresholdForm | null): boolean {
  return !!saved && (num(form.low_score_threshold) !== num(saved.low_score_threshold) || num(form.critical_score_threshold) !== num(saved.critical_score_threshold))
}

/* ── People (read-only summary of GET /v1/team/members) ── */
const ROLE_GROUPS: Array<[RegExp, string]> = [
  [/^(owner|manager|company_manager|office_manager|partneradmin|superadmin)$/i, 'Managers & owners'],
  [/^(teamlead|team_lead)$/i, 'Team leads'],
  [/^(salesrep|rep)$/i, 'Reps'],
]
export function roleGroup(role: string | null | undefined): string {
  const r = String(role ?? '').trim()
  return ROLE_GROUPS.find(([re]) => re.test(r))?.[1] ?? 'Other'
}
export function roleCounts(members: Array<{ role?: string | null }>): Array<{ label: string; count: number }> {
  const m = new Map<string, number>()
  for (const x of members) m.set(roleGroup(x.role), (m.get(roleGroup(x.role)) ?? 0) + 1)
  const order = ['Managers & owners', 'Team leads', 'Reps', 'Other']
  return order.filter((l) => m.has(l)).map((label) => ({ label, count: m.get(label)! }))
}

export type Seats = { allocated: number | null; used: number; available: number | null }
export function seatsText(s: Seats | null | undefined): string {
  if (!s) return 'Seat information isn’t available'
  if (s.allocated == null) return `${s.used} in use · no seat limit found`
  return `${s.used} of ${s.allocated} seats in use`
}

/* ── System (read-only summary of GET /v1/version; non-secret by design) ── */
export function summariseVersion(v: any): { rows: Array<{ label: string; value: string }> } {
  const rows: Array<{ label: string; value: string }> = []
  const sha = typeof v?.version === 'string' && v.version !== 'dev' ? v.version.slice(0, 7) : v?.version === 'dev' ? 'dev build' : null
  if (sha) rows.push({ label: 'API version', value: sha })
  if (v?.buildTime) { const d = new Date(v.buildTime); if (Number.isFinite(d.getTime())) rows.push({ label: 'API built', value: d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) }) }
  if (v?.app_env) rows.push({ label: 'Environment', value: String(v.app_env) })
  if (v?.scoring?.contract) rows.push({ label: 'Scoring contract', value: String(v.scoring.contract) })
  if (v?.scoring?.provider) rows.push({ label: 'Scoring provider', value: String(v.scoring.provider) })
  if (v?.transcription_provider) rows.push({ label: 'Transcription', value: typeof v.transcription_provider === 'string' ? v.transcription_provider : String(v.transcription_provider?.provider ?? v.transcription_provider?.name ?? '') })
  if (v?.sparring?.provider) rows.push({ label: 'Sparring buyer', value: String(v.sparring.provider) })
  return { rows: rows.filter((r) => r.value) }
}
