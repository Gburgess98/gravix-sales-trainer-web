// Pure rep-progress model shared by Home (/dashboard) and Progress (/progress).
// Moved verbatim from the dashboard page (no behaviour change) so the two screens
// can never disagree about streaks, levels, trend direction or skill status.

// /v1/reps/me is an identity endpoint (id, name, tier, company/partner ids). It carries NO points: use xpFromResponse below.
export type RepMe = {
  id: string
  name?: string | null
  tier?: string | null
}

// ── Points (the one contract every screen must share) ─────────────────────────────────────────────────────────
// Live endpoint: GET /v1/reps/:id/xp -> { ok, repId, total_xp: number, last_event_at: ISO|null, warning?: string }   (API src/routes/reps.ts)
// - The API answers ok:true with `warning` (and total_xp 0) when it could not read the points table: that is "unavailable", not 0 points.
// - No endpoint returns a points-today figure, so `today` is always null and must not be displayed.
// - /v1/assignments/me does NOT exist on the live API and /v1/reps/me returns no points.
export type Xp = { total: number; today: number | null }
export const xpPath = (repId: string) => `/v1/reps/${encodeURIComponent(repId)}/xp`
/** Parse the points response. null = unavailable (failed request, ok:false, warning, or a non-finite/missing total). */
export function xpFromResponse(d: unknown): Xp | null {
  const o = d as { ok?: unknown; total_xp?: unknown; warning?: unknown } | null
  if (!o || typeof o !== 'object' || o.ok === false || o.warning) return null
  return typeof o.total_xp === 'number' && Number.isFinite(o.total_xp) ? { total: o.total_xp, today: null } : null
}

export type Assignment = {
  id: string
  title?: string | null
  type?: string | null
  status: 'open' | 'assigned' | 'completed' | string
  due_at?: string | null
  completed_at?: string | null
  created_at?: string | null
  meta?: Record<string, any> | null
}

export type AssignmentSummary = {
  open_count?: number
  completed_count?: number
  overdue_count?: number
  due_today_count?: number
  today_focus?: Assignment | null
}

export type TrendPoint = { date: string; voice_score: number }

export type DailyFeed = {
  coaching_summary?: string | null
  weakest_area?: { category?: string; score?: number } | null
  strongest_area?: { category?: string; score?: number } | null
  momentum_insight?: string | null
  momentum_delta?: number | null
  regression_warnings?: string[]
  recommended_replay?: { call_id?: string; score?: number } | null
  recommended_drill?: string | null
  coaching_urgency?: 'low' | 'medium' | 'high' | null
  ai_motivation_message?: string | null
  todays_focus?: string | null
}

export const SKILL_CATEGORIES = [
  { key: 'discovery', label: 'Discovery' },
  { key: 'objection_handling', label: 'Objection Handling' },
  { key: 'closing', label: 'Closing' },
  { key: 'confidence', label: 'Confidence' },
]

export const TIER_COLORS: Record<string, string> = {
  bronze: 'text-orange-300',
  silver: 'text-slate-300',
  gold: 'text-yellow-300',
  platinum: 'text-indigo-300',
  diamond: 'text-indigo-200',
}

// Performance-level names per progress level — purely cosmetic, no backend change needed
export const RANK_NAMES: string[] = [
  'Foundation',
  'Developing I', 'Developing II', 'Developing III',
  'Emerging I', 'Emerging II', 'Emerging III',
  'Established I', 'Established II', 'Established III',
  'Advanced I', 'Advanced II', 'Advanced III',
  'Expert I', 'Expert II', 'Expert III',
  'Principal',
]

export function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function computeStreak(assignments: Assignment[]): number {
  const days = new Set<string>()
  for (const a of assignments) {
    if (!a.completed_at) continue
    const t = new Date(a.completed_at)
    if (!Number.isNaN(t.getTime())) days.add(ymdLocal(t))
  }
  let streak = 0
  const cur = new Date()
  while (days.has(ymdLocal(cur))) {
    streak++
    cur.setDate(cur.getDate() - 1)
  }
  return streak
}

export function xpLevel(xp: number): { level: number; pct: number; next: number; rank: string; nextRank: string } {
  const level = Math.floor(xp / 100)
  const pct = xp % 100
  const rank = RANK_NAMES[Math.min(level, RANK_NAMES.length - 1)]
  const nextRank = RANK_NAMES[Math.min(level + 1, RANK_NAMES.length - 1)]
  return { level, pct, next: (level + 1) * 100, rank, nextRank }
}

export function trendDirection(trend: TrendPoint[]): 'improving' | 'declining' | 'stable' {
  if (trend.length < 4) return 'stable'
  const recent = trend.slice(-3).reduce((s, p) => s + p.voice_score, 0) / 3
  const earlier = trend.slice(-7, -4).reduce((s, p) => s + p.voice_score, 0) / 3
  if (recent - earlier > 3) return 'improving'
  if (earlier - recent > 3) return 'declining'
  return 'stable'
}

export function trendDelta(trend: TrendPoint[]): number | null {
  if (trend.length < 4) return null
  const recent = trend.slice(-3).reduce((s, p) => s + p.voice_score, 0) / 3
  const earlier = trend.slice(-7, -4).reduce((s, p) => s + p.voice_score, 0) / 3
  return Math.round(recent - earlier)
}

export function skillStatus(key: string, feed: DailyFeed | null): 'improving' | 'stable' | 'attention' {
  if (!feed) return 'stable'
  const weakest = String(feed.weakest_area?.category ?? '').toLowerCase().replace(/\s+/g, '_')
  const keyRoot = key.replace('_handling', '').split('_')[0]
  if (weakest && weakest.includes(keyRoot)) return 'attention'
  const warnings = (feed.regression_warnings ?? []).join(' ').toLowerCase()
  const keyword = key.replace('_handling', '').replace('_', ' ')
  if (warnings.includes(keyword)) return 'attention'
  const strongest = String(feed.strongest_area?.category ?? '').toLowerCase().replace(/\s+/g, '_')
  if (strongest && strongest.includes(keyRoot)) return 'improving'
  if ((feed.momentum_delta ?? 0) > 0) return 'improving'
  return 'stable'
}
