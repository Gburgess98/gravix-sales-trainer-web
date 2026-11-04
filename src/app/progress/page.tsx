'use client'

// Rep Progress (glass system). All data is the signed-in rep's OWN, from existing endpoints:
//   /v1/reps/me                      identity (id) — live
//   /v1/reps/:id/weakness-trends     per-stage + overall score series, latest 100 calls — derived on request
//   /v1/assignments                  completed work, streak (derived client-side), open count — live
//   /v1/assignments/me               points (reps.xp) and points today — live
//   /v1/dashboard/voice-score-trend  daily voice average, requested with repId=<self> — derived
//   /v1/reps/:id/daily-feed          rule-based suggestions from the latest call — derived
// The range (30/90 days) only changes how the series are windowed (current vs previous period).

import { useCallback, useEffect, useRef, useState } from 'react'
import { proxyFetch } from '@/lib/api'
import { PageShell, PageHead, dsButton } from '@/components/ds'
import { ProgressView, type Section } from '@/components/rep/progress-view'
import type { DailyFeed, TrendPoint } from '@/lib/progress-model'
import type { MyAssignment } from '@/lib/my-assignments-model'
import type { Range, WeaknessTrends } from '@/lib/progress-view-model'

const none = <T,>(): Section<T> => ({ data: null, error: false })

async function getJson(path: string): Promise<any | null> {
  try {
    const res = await proxyFetch(path, { cache: 'no-store' })
    const d = await res.json().catch(() => null)
    return res.ok && d?.ok !== false ? d : null
  } catch {
    return null
  }
}

export default function ProgressPage() {
  const [range, setRange] = useState<Range>(30)
  const [loading, setLoading] = useState(true)
  const [fatal, setFatal] = useState(false)
  const [trends, setTrends] = useState<Section<WeaknessTrends>>(none())
  const [assignments, setAssignments] = useState<Section<MyAssignment[]>>(none())
  const [xp, setXp] = useState<Section<{ total: number; today: number }>>(none())
  const [voice, setVoice] = useState<Section<{ trend: TrendPoint[]; latest: number | null }>>(none())
  const [feed, setFeed] = useState<DailyFeed | null>(null)
  const repIdRef = useRef<string | null>(null)
  const rangeRef = useRef<Range>(30)
  rangeRef.current = range

  // ?range=90 survives reload and back/forward; replaceState adds no history entries.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('range') === '90') setRange(90)
  }, [])

  const loadVoice = useCallback(async (days: Range) => {
    const id = repIdRef.current
    if (!id) return
    // repId=<self> keeps this the rep's OWN trend (without it a manager would get the whole team's).
    const d = await getJson(`/v1/dashboard/voice-score-trend?days=${days}&repId=${encodeURIComponent(id)}`)
    setVoice(d ? { data: { trend: d.trend ?? [], latest: d.latest_avg ?? null }, error: false } : { data: null, error: true })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setFatal(false)
    const me = await getJson('/v1/reps/me')
    const meObj = me?.me ?? me
    const repId: string | null = meObj?.id ?? null
    if (!repId) {
      setFatal(true)
      setLoading(false)
      return
    }
    repIdRef.current = repId
    const [t, a, x, f] = await Promise.all([
      getJson(`/v1/reps/${encodeURIComponent(repId)}/weakness-trends`),
      getJson('/v1/assignments'),
      getJson('/v1/assignments/me'),
      getJson(`/v1/reps/${encodeURIComponent(repId)}/daily-feed`),
    ])
    setTrends(t?.trends ? { data: t.trends as WeaknessTrends, error: false } : { data: null, error: true })
    setAssignments(a ? { data: (a.assignments ?? a.items ?? []) as MyAssignment[], error: false } : { data: null, error: true })
    setXp(x?.rep ? { data: { total: Number(x.rep.xp_total) || 0, today: Number(x.rep.xp_today) || 0 }, error: false } : { data: null, error: true })
    setFeed(f && (f.coaching_summary || f.weakest_area || f.recommended_drill || f.recommended_replay) ? (f as DailyFeed) : null)
    await loadVoice(rangeRef.current)
    setLoading(false)
  }, [loadVoice])

  useEffect(() => { void load() }, [load])

  const onRangeChange = (r: Range) => {
    setRange(r)
    window.history.replaceState(window.history.state, '', r === 90 ? '?range=90' : window.location.pathname)
    void loadVoice(r)
  }

  return (
    <PageShell>
      <PageHead
        title="Progress"
        subtitle="How your calls and practice are trending."
        actions={<button type="button" onClick={() => void load()} className={dsButton('quiet', 'sm')}>Refresh</button>}
      />
      <ProgressView
        range={range}
        onRangeChange={onRangeChange}
        loading={loading}
        fatal={fatal}
        onRetry={() => void load()}
        trends={trends}
        assignments={assignments}
        xp={xp}
        voice={voice}
        feed={feed}
      />
    </PageShell>
  )
}
