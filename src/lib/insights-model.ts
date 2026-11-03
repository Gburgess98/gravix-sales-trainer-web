// Pure helpers for the manager Insights screen (/crm/analytics). No React, no I/O.
// Everything is arithmetic over the three analytics responses; derived values carry honest labels.

export type ScorePoint = { day: string; avg_score: number }
export type StageCount = { stage: string; count: number }
export type RepActivityRow = { rep_id: string; rep_name?: string; activities_created: number; activities_completed: number }

export type ScoreSummary = {
  /** Mean of the daily averages (not weighted by call volume) — shown as such. */
  average: number
  /** Second half of the range vs the first half; null with fewer than 4 days. */
  delta: number | null
  latest: ScorePoint
  high: ScorePoint
  low: ScorePoint
}

export function summariseScores(trend: ScorePoint[]): ScoreSummary | null {
  if (!trend.length) return null
  const mean = (rows: ScorePoint[]) => rows.reduce((a, s) => a + s.avg_score, 0) / rows.length
  let delta: number | null = null
  if (trend.length >= 4) {
    const mid = Math.floor(trend.length / 2)
    delta = Math.round(mean(trend.slice(mid)) - mean(trend.slice(0, mid)))
  }
  return {
    average: Math.round(mean(trend)),
    delta,
    latest: trend[trend.length - 1],
    high: trend.reduce((a, b) => (b.avg_score > a.avg_score ? b : a)),
    low: trend.reduce((a, b) => (b.avg_score < a.avg_score ? b : a)),
  }
}

export function completionRate(created: number, completed: number): number | null {
  return created > 0 ? Math.round((completed / created) * 100) : null
}

/** Bars sized relative to the largest count (0–100), biggest first. Counts are transitions, not conversion rates. */
export function stageBars(rows: StageCount[]): Array<StageCount & { pct: number }> {
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0)
  return rows
    .slice()
    .sort((a, b) => b.count - a.count)
    .map((r) => ({ ...r, pct: max > 0 ? Math.round((r.count / max) * 100) : 0 }))
}

export type RepBar = { rep_id: string; label: string; created: number; completed: number; pct: number }

/** Most-coached first; `pct` is completed / created (0 when nothing was created). */
export function repBars(rows: RepActivityRow[], labelOf: (r: RepActivityRow) => string): RepBar[] {
  return rows
    .map((r) => ({
      rep_id: r.rep_id,
      label: labelOf(r),
      created: r.activities_created,
      completed: r.activities_completed,
      pct: r.activities_created > 0 ? Math.min(100, Math.round((r.activities_completed / r.activities_created) * 100)) : 0,
    }))
    .sort((a, b) => b.created - a.created || a.label.localeCompare(b.label))
}
