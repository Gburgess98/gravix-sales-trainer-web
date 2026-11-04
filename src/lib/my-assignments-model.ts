// Pure helpers for the rep's OWN assignments (GET /v1/assignments). No React, no I/O.
// This is not the manager's team list (assignments-model.ts): the rep API returns only the caller's rows,
// has no manager name, and carries no manager feedback beyond the optional creation note in meta.
// Nothing here invents a manager, deadline, evidence or response.

export type MyAssignment = {
  id: string
  type?: string | null
  target_id?: string | null
  title?: string | null
  status?: string | null
  manager_id?: string | null
  due_at?: string | null
  created_at?: string | null
  completed_at?: string | null
  completed_by?: string | null
  source?: string | null
  flagged_call?: boolean | null
  threshold_band?: string | null
  needs_manager_review?: boolean | null
  meta?: Record<string, any> | null
}

export type Group = 'todo' | 'done' | 'other'
export type DueState = 'overdue' | 'today' | 'upcoming' | 'none'
export type DueFilter = 'all' | DueState

const DAY = 86_400_000
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const time = (s?: string | null) => {
  const t = s ? new Date(s).getTime() : NaN
  return Number.isFinite(t) ? t : null
}

/** open/assigned = to do; completed/reviewed = done; anything else (cancelled …) is in neither list. */
export function groupOf(a: MyAssignment): Group {
  const s = String(a.status ?? '').toLowerCase()
  if (s === 'assigned' || s === 'open' || s === '') return 'todo'
  if (s === 'completed' || s === 'reviewed') return 'done'
  return 'other'
}

/** Calendar-day based: due earlier today is "today", not overdue. */
export function dueStateOf(a: MyAssignment, now: Date = new Date()): DueState {
  const due = time(a.due_at)
  if (due === null) return 'none'
  const d = startOfDay(new Date(due))
  const today = startOfDay(now)
  return d < today ? 'overdue' : d === today ? 'today' : 'upcoming'
}

export function dueText(a: MyAssignment, now: Date = new Date()): string {
  const due = time(a.due_at)
  if (due === null) return 'No due date'
  const days = Math.round((startOfDay(new Date(due)) - startOfDay(now)) / DAY)
  if (days < 0) return `Overdue by ${-days} ${days === -1 ? 'day' : 'days'}`
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  return `Due in ${days} days`
}

const RANK: Record<DueState, number> = { overdue: 0, today: 1, upcoming: 2, none: 3 }

/** Overdue → today → upcoming → no date; earliest due first, then oldest created. Same order the page always used. */
export function compareTodo(a: MyAssignment, b: MyAssignment, now: Date = new Date()): number {
  const ra = RANK[dueStateOf(a, now)]
  const rb = RANK[dueStateOf(b, now)]
  if (ra !== rb) return ra - rb
  const da = time(a.due_at)
  const db = time(b.due_at)
  if (da !== null && db !== null && da !== db) return da - db
  return (time(a.created_at) ?? 0) - (time(b.created_at) ?? 0)
}

export const typeLabel = (t: string | null | undefined): string => {
  const s = String(t ?? '').toLowerCase()
  if (s === 'sparring') return 'Sparring drill'
  if (s === 'call_review') return 'Call review'
  if (s === 'custom') return 'Coaching task'
  return s ? s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : 'Assignment'
}

export type Origin = 'critical' | 'auto' | 'flagged' | 'review' | 'manager' | 'unknown'

function metaOf(a: MyAssignment) {
  return a.meta && typeof a.meta === 'object' ? a.meta : {}
}

export function originOf(a: MyAssignment): Origin {
  const m = metaOf(a)
  const source = String(a.source ?? m.source ?? m.assignment_origin ?? '').trim().toLowerCase()
  const band = String(a.threshold_band ?? m.threshold_band ?? '').trim().toLowerCase()
  if (band === 'critical' || Boolean(a.needs_manager_review ?? m.needs_manager_review)) return 'critical'
  if (source === 'flagged_call_auto') return 'auto'
  if (Boolean(a.flagged_call ?? m.flagged_call) || band || source === 'flagged_call') return 'flagged'
  if (source === 'manager_review') return 'review'
  if (a.manager_id) return 'manager'
  return 'unknown'
}

/** Who it came from. The API has no manager name for reps, so this is "From your manager" only when a manager id is present. */
export function sourceLabel(a: MyAssignment): string | null {
  const o = originOf(a)
  if (o === 'auto') return 'Created automatically'
  if (o === 'critical' || o === 'flagged' || o === 'review' || o === 'manager') return a.manager_id ? 'From your manager' : null
  return null
}

/** Why it was assigned, from fields the row really has. Null when the row says nothing. */
export function whyText(a: MyAssignment): string | null {
  const m = metaOf(a)
  const score = Number(m.score_overall)
  const bit = Number.isFinite(score) ? ` (call score ${Math.round(score)})` : ''
  const o = originOf(a)
  if (o === 'critical') return `Flagged as critical after a call${bit}`
  if (o === 'auto') return `Created automatically after a flagged call${bit}`
  if (o === 'flagged') return `Assigned after a flagged call${bit}`
  if (o === 'review') return `Assigned from a call review${bit}`
  return null
}

/** The optional note the manager wrote when assigning. Only ever shown as the manager's own words. */
export function managerNote(a: MyAssignment): string | null {
  const n = String(metaOf(a).coaching_notes ?? '').trim()
  return n || null
}

export type Evidence = { label: string; detail: string }

/** Completion evidence the row actually carries; null otherwise. */
export function evidenceOf(a: MyAssignment): Evidence | null {
  const m = metaOf(a)
  if (String(m.completed_via ?? '') === 'sparring_session_match') {
    const s = typeof m.completion_score === 'number' ? ` · score ${Math.round(m.completion_score)}%` : ''
    return { label: 'Sparring session matched', detail: `Completed from a matched sparring session${s}` }
  }
  return null
}

export const reviewedByManager = (a: MyAssignment) => String(a.status ?? '').toLowerCase() === 'reviewed'

export type Action =
  | { kind: 'link'; label: string; href: string; hint?: string }
  | { kind: 'complete'; label: string }

export function sparringHref(id: string, personaId: string | null | undefined) {
  const pid = personaId && personaId.trim() ? personaId : 'default'
  return `/sparring/${encodeURIComponent(pid)}?assignmentId=${encodeURIComponent(id)}`
}

export function callReviewHref(a: MyAssignment) {
  const qs = new URLSearchParams()
  qs.set('assignment', a.id)
  qs.set('assignmentId', a.id)
  if (a.target_id) {
    qs.set('callId', a.target_id)
    return `/calls/${encodeURIComponent(a.target_id)}?${qs.toString()}`
  }
  return `/call-library?${qs.toString()}`
}

/** One primary action per row. To-do rows start the work; done rows only link to a real call. Null when there is nothing real to open. */
export function primaryAction(a: MyAssignment): Action | null {
  const g = groupOf(a)
  const t = String(a.type ?? '').toLowerCase()
  if (g === 'todo') {
    if (t === 'sparring') return { kind: 'link', label: 'Start sparring', href: sparringHref(a.id, a.target_id), hint: a.target_id ? undefined : 'No persona set on this assignment — using default.' }
    if (t === 'call_review') return { kind: 'link', label: a.target_id ? 'Review call' : 'Pick a call', href: callReviewHref(a) }
    return { kind: 'complete', label: 'Mark complete' }
  }
  if (g === 'done' && t === 'call_review' && a.target_id) return { kind: 'link', label: 'Review result', href: `/calls/${encodeURIComponent(a.target_id)}` }
  return null
}

export type Filters = { type?: string; due?: DueFilter }

export function filterTodo(items: MyAssignment[], f: Filters, now: Date = new Date()): MyAssignment[] {
  return items.filter((a) => {
    if (f.type && f.type !== 'all' && String(a.type ?? '') !== f.type) return false
    if (f.due && f.due !== 'all' && dueStateOf(a, now) !== f.due) return false
    return true
  })
}

export const isWithinDays = (iso: string | null | undefined, days: number, now: Date = new Date()) => {
  const t = time(iso)
  return t !== null && now.getTime() - t <= days * DAY && t <= now.getTime() + DAY
}

export function summarise(items: MyAssignment[], now: Date = new Date()) {
  const todo = items.filter((a) => groupOf(a) === 'todo')
  const done = items.filter((a) => groupOf(a) === 'done')
  return {
    todo: todo.length,
    overdue: todo.filter((a) => dueStateOf(a, now) === 'overdue').length,
    dueToday: todo.filter((a) => dueStateOf(a, now) === 'today').length,
    doneRecent: done.filter((a) => isWithinDays(a.completed_at, 7, now)).length,
    done: done.length,
  }
}

/** Newest completion first; rows without a completion date sink. */
export const sortDone = (items: MyAssignment[]) => [...items].sort((a, b) => (time(b.completed_at) ?? 0) - (time(a.completed_at) ?? 0))
