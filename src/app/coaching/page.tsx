'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { WorkspaceTabs } from '@/components/shell/workspace-tabs'
import { proxyFetch } from '@/lib/api'

type CoachingTab = 'overview' | 'assignments' | 'replay'

type RepRisk = {
  rep_id: string
  rep_name: string
  risk_band?: string
  risk_score?: number
  counts?: { open?: number; overdue?: number; completed_today?: number }
  reasons?: string[]
}

type Headline = {
  reps_total?: number
  reps_at_risk?: number
  reps_watch?: number
  overdue_actions_total?: number
  open_actions_total?: number
  window_days?: number
}

type Assignment = {
  id: string
  title?: string | null
  type?: string
  status?: string
  rep_id?: string | null
  due_at?: string | null
  created_at: string
  meta?: Record<string, any> | null
}

type CallItem = {
  id: string
  filename?: string | null
  score_overall?: number | null
  created_at: string
  rep_name?: string | null
  status?: string
  flags?: string[] | null
}

function riskPill(band?: string) {
  const b = String(band ?? '').toLowerCase()
  if (b === 'at_risk')
    return <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-red-500/30 bg-red-500/10 text-red-300 uppercase tracking-wide font-semibold">At Risk</span>
  if (b === 'watch')
    return <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 uppercase tracking-wide font-semibold">Watch</span>
  if (b === 'healthy')
    return <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 uppercase tracking-wide font-semibold">Healthy</span>
  return null
}

function scoreClass(score: number | null | undefined) {
  if (score == null) return 'text-neutral-500'
  if (score < 60) return 'text-red-300'
  if (score < 75) return 'text-amber-300'
  return 'text-emerald-300'
}

export default function CoachingPage() {
  const [tab, setTab] = useState<CoachingTab>('overview')

  // Overview
  const [reps, setReps] = useState<RepRisk[]>([])
  const [headline, setHeadline] = useState<Headline | null>(null)
  const [overviewLoading, setOverviewLoading] = useState(true)
  const [overviewError, setOverviewError] = useState<string | null>(null)

  // Assignments
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [assignmentsLoading, setAssignmentsLoading] = useState(false)
  const [assignmentFilter, setAssignmentFilter] = useState<'open' | 'overdue' | 'all'>('open')

  // Replay
  const [calls, setCalls] = useState<CallItem[]>([])
  const [replayLoading, setReplayLoading] = useState(false)
  const [replayThreshold, setReplayThreshold] = useState<70 | 60 | 50>(70)

  const loadOverview = useCallback(async () => {
    setOverviewLoading(true)
    setOverviewError(null)
    try {
      const res = await proxyFetch('/v1/crm/manager/control-centre?days=7&limit=20', { cache: 'no-store' })
      const data = await res.json()
      if (data?.ok) {
        setHeadline(data.headline ?? null)
        const allReps: RepRisk[] = data.reps_all ?? []
        // Sort by urgency: overdue → open count
        allReps.sort((a, b) => {
          const ao = Number(a.counts?.overdue ?? 0), bo = Number(b.counts?.overdue ?? 0)
          if (bo !== ao) return bo - ao
          return Number(b.counts?.open ?? 0) - Number(a.counts?.open ?? 0)
        })
        setReps(allReps)
      } else {
        setOverviewError(data.error || 'Failed to load coaching data')
      }
    } catch (e: any) {
      setOverviewError(e?.message || 'Connection error')
    } finally {
      setOverviewLoading(false)
    }
  }, [])

  const loadAssignments = useCallback(async () => {
    setAssignmentsLoading(true)
    try {
      const res = await proxyFetch('/v1/assignments?limit=40', { cache: 'no-store' })
      const data = await res.json()
      const items: Assignment[] = data.assignments ?? data.items ?? []
      setAssignments(items)
    } catch (e: any) {
      console.error('coaching assignments load failed', e)
      setAssignments([])
    } finally {
      setAssignmentsLoading(false)
    }
  }, [])

  const loadReplay = useCallback(async () => {
    setReplayLoading(true)
    try {
      const res = await proxyFetch('/v1/calls/paged?limit=50&scope=company', { cache: 'no-store' })
      const data = await res.json()
      const rawCalls: CallItem[] = data.calls ?? data.items ?? []
      // Filter to scored calls only, sort lowest score first
      const scored = rawCalls
        .filter((c) => typeof c.score_overall === 'number')
        .sort((a, b) => (a.score_overall ?? 999) - (b.score_overall ?? 999))
      setCalls(scored)
    } catch (e: any) {
      console.error('coaching replay load failed', e)
      setCalls([])
    } finally {
      setReplayLoading(false)
    }
  }, [])

  // Load overview on mount
  useEffect(() => { loadOverview() }, [loadOverview])

  // Load tab data on switch
  useEffect(() => {
    if (tab === 'assignments' && assignments.length === 0) loadAssignments()
    if (tab === 'replay' && calls.length === 0) loadReplay()
  }, [tab, assignments.length, calls.length, loadAssignments, loadReplay])

  // Filtered assignments
  const filteredAssignments = assignments.filter((a) => {
    if (assignmentFilter === 'open') return a.status === 'open' || a.status === 'assigned'
    if (assignmentFilter === 'overdue') {
      if (!a.due_at) return false
      return new Date(a.due_at) < new Date() && (a.status === 'open' || a.status === 'assigned')
    }
    return true
  })

  // Filtered replay calls
  const filteredCalls = calls.filter((c) => (c.score_overall ?? 999) < replayThreshold)

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Coaching</p>
          <h1 className="mt-0.5 text-xl font-semibold text-white">Command Centre</h1>
          <p className="mt-0.5 text-sm text-neutral-400">
            Rep interventions · Assignment queue · Replay review
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/crm/manager/control-centre"
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-xs text-neutral-300 hover:bg-neutral-800 transition-colors"
          >
            Full Control Centre →
          </Link>
        </div>
      </div>

      <WorkspaceTabs
        tabs={[
          { id: 'overview', label: 'Overview', badge: headline?.reps_at_risk || undefined },
          { id: 'assignments', label: 'Assignments' },
          { id: 'replay', label: 'Replay Queue' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {/* ── OVERVIEW TAB ── */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {/* KPI cards */}
          {headline && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
                <div className="text-[10px] uppercase tracking-widest text-red-400/70">At Risk</div>
                <div className="mt-1 text-2xl font-semibold text-red-300">{headline.reps_at_risk ?? 0}</div>
                <div className="mt-0.5 text-xs text-neutral-500">reps</div>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                <div className="text-[10px] uppercase tracking-widest text-amber-400/70">Watch</div>
                <div className="mt-1 text-2xl font-semibold text-amber-300">{headline.reps_watch ?? 0}</div>
                <div className="mt-0.5 text-xs text-neutral-500">reps</div>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3">
                <div className="text-[10px] uppercase tracking-widest text-neutral-500">Overdue</div>
                <div className="mt-1 text-2xl font-semibold text-white">{headline.overdue_actions_total ?? 0}</div>
                <div className="mt-0.5 text-xs text-neutral-500">tasks</div>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3">
                <div className="text-[10px] uppercase tracking-widest text-neutral-500">Open</div>
                <div className="mt-1 text-2xl font-semibold text-white">{headline.open_actions_total ?? 0}</div>
                <div className="mt-0.5 text-xs text-neutral-500">actions</div>
              </div>
            </div>
          )}

          {/* Rep coaching queue */}
          <div className="rounded-xl border border-neutral-800 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
              <div className="text-sm font-medium text-white">Rep Coaching Queue</div>
              <span className="text-xs text-neutral-500">{reps.length} reps</span>
            </div>

            {overviewLoading && (
              <div className="px-4 py-5 text-sm text-neutral-500">Loading rep data…</div>
            )}
            {overviewError && !overviewLoading && (
              <div className="px-4 py-5 text-sm text-red-400">{overviewError}</div>
            )}
            {!overviewLoading && !overviewError && reps.length === 0 && (
              <div className="px-4 py-5 text-sm text-neutral-500">No rep risk data available.</div>
            )}
            {!overviewLoading && reps.map((rep) => (
              <div key={rep.rep_id} className="flex items-center justify-between px-4 py-3 border-b border-neutral-800/50 last:border-0 hover:bg-neutral-900/40 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/reps/${rep.rep_id}`} className="text-sm font-medium text-white hover:underline">
                      {rep.rep_name}
                    </Link>
                    {riskPill(rep.risk_band)}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
                    {(rep.counts?.overdue ?? 0) > 0 && (
                      <span className="text-red-400">{rep.counts?.overdue} overdue</span>
                    )}
                    <span>{rep.counts?.open ?? 0} open</span>
                    {rep.counts?.completed_today ? (
                      <span className="text-emerald-400">{rep.counts.completed_today} done today</span>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/reps/${rep.rep_id}`}
                    className="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800 transition-colors"
                  >
                    Profile
                  </Link>
                  <Link
                    href={`/crm/actions?repId=${encodeURIComponent(rep.rep_id)}&status=open`}
                    className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-500/20 transition-colors"
                  >
                    Actions
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* Quick nav links */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Link
              href="/admin/assignments"
              className="group rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-4 hover:bg-neutral-800 hover:border-neutral-700 transition-colors"
            >
              <div className="text-[10px] uppercase tracking-widest text-neutral-500">Manager</div>
              <div className="mt-1 text-sm font-medium text-white group-hover:text-neutral-200">Assignment Manager →</div>
            </Link>
            <Link
              href="/assignments"
              className="group rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-4 hover:bg-neutral-800 hover:border-neutral-700 transition-colors"
            >
              <div className="text-[10px] uppercase tracking-widest text-neutral-500">Rep View</div>
              <div className="mt-1 text-sm font-medium text-white group-hover:text-neutral-200">My Assignments →</div>
            </Link>
            <Link
              href="/admin/score"
              className="group rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-4 hover:bg-neutral-800 hover:border-neutral-700 transition-colors"
            >
              <div className="text-[10px] uppercase tracking-widest text-neutral-500">Scoring</div>
              <div className="mt-1 text-sm font-medium text-white group-hover:text-neutral-200">AI Score Review →</div>
            </Link>
          </div>
        </div>
      )}

      {/* ── ASSIGNMENTS TAB ── */}
      {tab === 'assignments' && (
        <div className="space-y-3">
          {/* Filter chips */}
          <div className="flex items-center gap-2 text-xs">
            {(['open', 'overdue', 'all'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setAssignmentFilter(f)}
                className={`rounded-full border px-3 py-1 transition-colors ${
                  assignmentFilter === f
                    ? 'border-neutral-100 bg-neutral-100 text-neutral-900'
                    : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800'
                }`}
              >
                {f === 'open' ? 'Open' : f === 'overdue' ? 'Overdue' : 'All'}
              </button>
            ))}
            {!assignmentsLoading && (
              <span className="ml-auto text-neutral-500">{filteredAssignments.length} assignments</span>
            )}
          </div>

          {assignmentsLoading && (
            <div className="text-sm text-neutral-500 py-4">Loading assignments…</div>
          )}

          {!assignmentsLoading && filteredAssignments.length === 0 && (
            <div className="rounded-xl border border-neutral-800 px-4 py-5 text-sm text-neutral-400">
              No {assignmentFilter !== 'all' ? assignmentFilter + ' ' : ''}assignments found.
            </div>
          )}

          {!assignmentsLoading && filteredAssignments.length > 0 && (
            <div className="rounded-xl border border-neutral-800 overflow-hidden">
              <div className="divide-y divide-neutral-800/60">
                {filteredAssignments.map((a) => {
                  const isOverdue = a.due_at && new Date(a.due_at) < new Date()
                  const urgency = (a.meta as any)?.threshold_band || (a.meta as any)?.urgency

                  return (
                    <div key={a.id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-white truncate">
                            {a.title || 'Untitled assignment'}
                          </span>
                          {urgency && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border uppercase tracking-wide font-semibold ${
                              urgency === 'critical'
                                ? 'border-red-500/30 bg-red-500/10 text-red-300'
                                : urgency === 'high'
                                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                                  : 'border-neutral-700 bg-neutral-900 text-neutral-400'
                            }`}>
                              {urgency}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
                          <span>{a.type || 'assignment'}</span>
                          {a.due_at && (
                            <span className={isOverdue ? 'text-red-400' : ''}>
                              {isOverdue ? 'Overdue · ' : 'Due '}
                              {new Date(a.due_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      {a.rep_id && (
                        <Link
                          href={`/reps/${a.rep_id}`}
                          className="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800 shrink-0 transition-colors"
                        >
                          Rep →
                        </Link>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Link
              href="/admin/assignments"
              className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-900 transition-colors"
            >
              Full Assignment Manager →
            </Link>
            <button
              type="button"
              onClick={loadAssignments}
              className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-900 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      )}

      {/* ── REPLAY QUEUE TAB ── */}
      {tab === 'replay' && (
        <div className="space-y-3">
          {/* Score threshold filter */}
          <div className="flex items-center gap-3 text-xs">
            <span className="text-neutral-500">Show calls scored below</span>
            {([70, 60, 50] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setReplayThreshold(t)}
                className={`rounded-full border px-3 py-1 transition-colors ${
                  replayThreshold === t
                    ? 'border-neutral-100 bg-neutral-100 text-neutral-900'
                    : 'border-neutral-700 text-neutral-300 hover:bg-neutral-800'
                }`}
              >
                {t}
              </button>
            ))}
            {!replayLoading && (
              <span className="ml-auto text-neutral-500">{filteredCalls.length} calls</span>
            )}
          </div>

          {replayLoading && (
            <div className="text-sm text-neutral-500 py-4">Loading calls…</div>
          )}

          {!replayLoading && filteredCalls.length === 0 && (
            <div className="rounded-xl border border-neutral-800 px-4 py-5 text-sm text-neutral-400">
              No scored calls below {replayThreshold} found.
            </div>
          )}

          {!replayLoading && filteredCalls.length > 0 && (
            <div className="rounded-xl border border-neutral-800 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
                <div className="text-sm font-medium text-white">Calls for Coaching Review</div>
                <span className="text-xs text-neutral-500">Lowest score first</span>
              </div>
              <div className="divide-y divide-neutral-800/60">
                {filteredCalls.slice(0, 30).map((call) => {
                  const score = typeof call.score_overall === 'number' ? Math.round(call.score_overall) : null
                  const hasFlags = Array.isArray(call.flags) && call.flags.length > 0

                  return (
                    <div key={call.id} className="px-4 py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-white truncate">
                            {call.filename || `Call ${call.id.slice(0, 8)}…`}
                          </span>
                          {hasFlags && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-300 uppercase tracking-wide font-semibold shrink-0">
                              Flagged
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-neutral-500">
                          {call.rep_name || 'Unknown rep'} · {new Date(call.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div className={`text-sm font-semibold tabular-nums shrink-0 ${scoreClass(score)}`}>
                        {score ?? '—'}
                      </div>
                      <Link
                        href={`/calls/${call.id}`}
                        className="rounded-lg border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800 shrink-0 transition-colors"
                      >
                        Review →
                      </Link>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Link
              href="/call-library"
              className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-900 transition-colors"
            >
              Full Call Library →
            </Link>
            <button
              type="button"
              onClick={loadReplay}
              className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-400 hover:bg-neutral-900 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
