'use client'

import Link from 'next/link'
import { Badge, GlassCard, Panel, PanelHeader, EmptyPanel, dsButton } from '@/components/ds'
import { formatCallDate } from '@/lib/ds-model'
import { RAG_META, biggestMovement, healthHeadline, ragFromScore, type Rag } from '@/lib/manager-model'

/* Manager Overview summary (glass system). Presentational only: every value comes from the
   GET /v1/manager/command-centre payload the page already loads. Structural types below are a
   subset of the page's CommandCentre type. Order = the manager's questions:
   how is my team → who needs me → what coaching is open → what is waiting for review → which way are skills moving. */

type Summary = {
  teamHealth: {
    status: Rag
    averageScore: number
    reviewedCalls: number
    callsNeedingReview: number
    openAssignments: number
    overdueAssignments: number
  }
  repsNeedingAttention: Array<{ repId: string; repName: string; averageScore: number; riskLevel: Rag; riskReason: string; recommendedAction: string }>
  callsNeedingReview: Array<{ callId: string; repName: string; title: string; overallScore: number; weakestSkill: string; createdAt: string }>
  openAssignments: Array<{ assignmentId: string; repName: string; title: string; status: 'open' | 'overdue' | 'completed' | 'reviewed'; dueAt: string | null; priority: 'low' | 'medium' | 'high' }>
  weakestSkills: Array<{ skill: string; count: number; averageScore: number; previousAverageScore?: number | null; delta?: number | null }>
  coachingImpact?: { summary: string }
}

export type OverviewTab = 'review' | 'interventions' | 'assignments'

const SHOW = 4

function More({ shown, total, label, onClick }: { shown: number; total: number; label: string; onClick: () => void }) {
  if (total <= shown) return null
  return (
    <button type="button" onClick={onClick} className="ds-focus w-full border-t border-[var(--ds-border)] px-5 py-3 text-left text-sm text-[var(--ds-text-2)] transition-colors hover:bg-white/[0.03] hover:text-[var(--ds-text)] motion-reduce:transition-none">
      {label} ({total - shown} more)
    </button>
  )
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'bad' | 'warn' }) {
  return (
    <div>
      <dt className="text-xs text-[var(--ds-text-3)]">{label}</dt>
      <dd className={`mt-0.5 text-2xl font-semibold tabular-nums ${tone === 'bad' ? 'text-red-200' : tone === 'warn' ? 'text-amber-200' : 'text-[var(--ds-text)]'}`}>{value}</dd>
    </div>
  )
}

export function ManagerOverviewSummary({ data, onOpenTab }: { data: Summary; onOpenTab: (tab: OverviewTab) => void }) {
  const h = data.teamHealth
  const rag = RAG_META[h.status] ?? RAG_META.amber
  const reps = data.repsNeedingAttention
  const open = data.openAssignments.filter((a) => a.status === 'open' || a.status === 'overdue')
  // Overdue first, then soonest due.
  const outstanding = open.slice().sort((a, b) => {
    const ao = a.status === 'overdue' ? 0 : 1
    const bo = b.status === 'overdue' ? 0 : 1
    if (ao !== bo) return ao - bo
    return new Date(a.dueAt ?? '9999-12-31').getTime() - new Date(b.dueAt ?? '9999-12-31').getTime()
  })
  const calls = data.callsNeedingReview.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const move = biggestMovement(data.weakestSkills)
  const weakest = data.weakestSkills[0]

  return (
    <div className="space-y-6">
      {/* 1 — team health */}
      <GlassCard>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <Badge tone={rag.tone}>{rag.label}</Badge>
              <span className="text-xs text-[var(--ds-text-3)]">Last 30 days</span>
            </div>
            <p className="mt-3 max-w-2xl text-lg font-medium leading-snug text-[var(--ds-text)] sm:text-xl">
              {healthHeadline({ status: h.status, repsNeedingAttention: reps.length, overdue: h.overdueAssignments, callsNeedingReview: h.callsNeedingReview })}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/upload" className={dsButton('primary', 'md')}>Upload call</Link>
            <button type="button" onClick={() => onOpenTab('review')} className={dsButton('secondary', 'md')}>
              Review queue{h.callsNeedingReview > 0 ? ` (${h.callsNeedingReview})` : ''}
            </button>
          </div>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-[var(--ds-border)] pt-5 sm:grid-cols-4">
          <Stat label="Team average" value={h.averageScore} tone={ragFromScore(h.averageScore) === 'red' ? 'bad' : ragFromScore(h.averageScore) === 'amber' ? 'warn' : undefined} />
          <Stat label="Calls reviewed" value={h.reviewedCalls} />
          <Stat label="Open coaching" value={h.openAssignments} />
          <Stat label="Overdue" value={h.overdueAssignments} tone={h.overdueAssignments > 0 ? 'bad' : undefined} />
        </dl>
      </GlassCard>

      {/* 2 — who needs me, what coaching is open */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Panel>
          <PanelHeader title="Reps requiring attention" meta={reps.length > 0 ? `${reps.length}` : undefined} action={reps.length > 0 ? <button type="button" onClick={() => onOpenTab('interventions')} className="ds-focus rounded text-sm text-[var(--ds-text-2)] hover:text-[var(--ds-text)]">All interventions</button> : undefined} />
          {reps.length === 0 ? (
            <EmptyPanel title="Every rep is on track" body="Reps appear here when scores or coaching follow-through slip." />
          ) : (
            <ul aria-label="Reps requiring attention" className="divide-y divide-[var(--ds-border)]">
              {reps.slice(0, SHOW).map((r) => (
                <li key={r.repId}>
                  <Link href={`/crm/reps/${encodeURIComponent(r.repId)}`} className="ds-focus flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-white/[0.03] motion-reduce:transition-none">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-[var(--ds-text)]">{r.repName}</span>
                      <span className="mt-0.5 block truncate text-xs text-[var(--ds-text-3)]">{r.recommendedAction || r.riskReason}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="text-sm tabular-nums text-[var(--ds-text-2)]">{Math.round(r.averageScore)}</span>
                      <Badge tone={(RAG_META[r.riskLevel] ?? RAG_META.amber).tone}>{(RAG_META[r.riskLevel] ?? RAG_META.amber).label}</Badge>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <More shown={SHOW} total={reps.length} label="See all reps needing attention" onClick={() => onOpenTab('interventions')} />
        </Panel>

        <Panel>
          <PanelHeader title="Outstanding coaching" meta={outstanding.length > 0 ? `${outstanding.length}` : undefined} />
          {outstanding.length === 0 ? (
            <EmptyPanel title="No open coaching" body="Assignments you create from a review or a drill show up here." />
          ) : (
            <ul aria-label="Outstanding coaching" className="divide-y divide-[var(--ds-border)]">
              {outstanding.slice(0, SHOW).map((a) => (
                <li key={a.assignmentId} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-[var(--ds-text)]">{a.title}</span>
                    <span className="mt-0.5 block truncate text-xs text-[var(--ds-text-3)]">
                      {a.repName}{a.dueAt ? ` · due ${formatCallDate(a.dueAt)}` : ''}
                    </span>
                  </span>
                  {a.status === 'overdue' ? <Badge tone="bad">Overdue</Badge> : <Badge>Open</Badge>}
                </li>
              ))}
            </ul>
          )}
          <More shown={SHOW} total={outstanding.length} label="See all assignments" onClick={() => onOpenTab('assignments')} />
        </Panel>
      </div>

      {/* 3 — reviews waiting, and the one trend */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[3fr_2fr] [&>*]:min-w-0">
        <Panel>
          <PanelHeader title="Recent reviews" meta={calls.length > 0 ? `${calls.length} waiting` : undefined} />
          {calls.length === 0 ? (
            <EmptyPanel title="Nothing waiting for review" body={h.reviewedCalls > 0 ? `${h.reviewedCalls} calls reviewed in the last 30 days.` : 'Scored calls that need a manager look appear here.'} />
          ) : (
            <ul aria-label="Calls waiting for review" className="divide-y divide-[var(--ds-border)]">
              {calls.slice(0, SHOW).map((c) => (
                <li key={c.callId}>
                  <Link href={`/calls/${encodeURIComponent(c.callId)}`} className="ds-focus flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-white/[0.03] motion-reduce:transition-none">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-[var(--ds-text)]">{c.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-[var(--ds-text-3)]">
                        {c.repName} · {formatCallDate(c.createdAt) ?? 'Recent'}{c.weakestSkill ? ` · weakest: ${c.weakestSkill}` : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <Badge tone={RAG_META[ragFromScore(c.overallScore) ?? 'amber'].tone}>{Math.round(c.overallScore)}</Badge>
                      <span aria-hidden className="text-[var(--ds-text-3)]">›</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <More shown={SHOW} total={calls.length} label="Open the review queue" onClick={() => onOpenTab('review')} />
        </Panel>

        <GlassCard as="div">
          <h2 className="text-base font-semibold text-[var(--ds-text)]">Skill trend</h2>
          {move ? (
            <>
              <p className="mt-4 text-sm text-[var(--ds-text-2)]">{move.skill}</p>
              <p className={`mt-1 text-4xl font-semibold tabular-nums ${(move.delta as number) < 0 ? 'text-red-200' : 'text-emerald-200'}`}>
                {(move.delta as number) > 0 ? '+' : ''}{Math.round(move.delta as number)}
                <span className="ml-1 text-base font-normal text-[var(--ds-text-3)]">pts</span>
              </p>
              <p className="mt-1 text-xs text-[var(--ds-text-3)]">
                {typeof move.previousAverageScore === 'number' ? `${Math.round(move.previousAverageScore)} → ${Math.round(move.averageScore)}` : `Now ${Math.round(move.averageScore)}`} vs the previous 30 days
              </p>
              {data.coachingImpact?.summary && <p className="mt-4 border-t border-[var(--ds-border)] pt-3 text-sm text-[var(--ds-text-2)]">{data.coachingImpact.summary}</p>}
            </>
          ) : weakest ? (
            <>
              <p className="mt-4 text-sm text-[var(--ds-text-2)]">Weakest skill: {weakest.skill}</p>
              <p className="mt-1 text-4xl font-semibold tabular-nums text-[var(--ds-text)]">{Math.round(weakest.averageScore)}</p>
              <p className="mt-1 text-xs text-[var(--ds-text-3)]">Movement shows once there are scored calls in two periods.</p>
            </>
          ) : (
            <p className="mt-4 text-sm text-[var(--ds-text-3)]">Skill movement appears once calls have been scored.</p>
          )}
        </GlassCard>
      </div>
    </div>
  )
}
