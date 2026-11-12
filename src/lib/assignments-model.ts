// Pure helpers for the manager Assignments list (glass system). No React, no I/O.
// Shapes mirror GET /v1/assignments/manager items; nothing here invents a field.

export type AssignmentLike = {
  id: string
  title?: string | null
  type?: string | null
  status?: string | null
  rep_id?: string | null
  due_at?: string | null
  created_at?: string | null
  completed_at?: string | null
  target_id?: string | null
  source?: string | null
  meta?: Record<string, any> | null
}

export type AssignmentStatus = 'open' | 'overdue' | 'completed' | 'cancelled'
export type DueState = 'overdue' | 'today' | 'week' | 'later' | 'none'

const DAY = 86_400_000
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** completed/reviewed = completed; cancelled never counts as open or overdue; otherwise overdue iff past its due date. */
export function statusOf(a: AssignmentLike, now: Date = new Date()): AssignmentStatus {
  const s = String(a.status ?? '').toLowerCase()
  if (s === 'completed' || s === 'reviewed') return 'completed'
  if (s === 'cancelled' || s === 'canceled') return 'cancelled'
  if (a.due_at) {
    const due = new Date(a.due_at).getTime()
    if (Number.isFinite(due) && due < now.getTime()) return 'overdue'
  }
  return 'open'
}

export function dueStateOf(a: AssignmentLike, now: Date = new Date()): DueState {
  if (!a.due_at) return 'none'
  const due = new Date(a.due_at)
  if (!Number.isFinite(due.getTime())) return 'none'
  if (statusOf(a, now) === 'overdue') return 'overdue'
  const days = Math.round((startOfDay(due) - startOfDay(now)) / DAY)
  if (days <= 0) return 'today'
  return days <= 7 ? 'week' : 'later'
}

export function typeLabel(type: string | null | undefined): string {
  const t = String(type ?? '').trim().replace(/[_-]+/g, ' ')
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Assignment'
}

export type Evidence = { label: string; detail?: string; callId?: string }

/** Proof the assignment actually carries: persisted sparring completion proof and/or a source call. Null when there is none. */
export function evidenceOf(a: AssignmentLike): Evidence | null {
  const m = a.meta ?? {}
  if (String(m.completed_via ?? '') === 'sparring_session_match') {
    const score = typeof m.completion_score === 'number' ? ` · score ${Math.round(m.completion_score)}%` : ''
    return { label: 'Sparring proof', detail: `Completed from a matched sparring session${score}` }
  }
  const callId = String(m.source_call_id ?? '').trim() || (String(a.type ?? '') === 'call_review' && a.target_id ? String(a.target_id) : '')
  if (callId) return { label: 'From call', detail: 'Created from a call review', callId }
  return null
}

export type Counts = { open: number; overdue: number; completed: number; total: number }

/** Open = not completed/cancelled and not past due; overdue shown separately so the three never double-count. */
export function summarise(list: AssignmentLike[], now: Date = new Date()): Counts {
  const c: Counts = { open: 0, overdue: 0, completed: 0, total: list.length }
  for (const a of list) {
    const s = statusOf(a, now)
    if (s === 'open') c.open += 1
    else if (s === 'overdue') c.overdue += 1
    else if (s === 'completed') c.completed += 1
  }
  return c
}

export type AssignmentFilters = {
  q?: string
  status?: AssignmentStatus | 'all'
  rep?: string // rep_id or 'all'
  type?: string // raw type or 'all'
  due?: DueState | 'all'
}

export function filterAssignments(
  list: AssignmentLike[],
  f: AssignmentFilters,
  repNameOf: (id: string | null | undefined) => string,
  now: Date = new Date(),
): AssignmentLike[] {
  const q = (f.q ?? '').trim().toLowerCase()
  return list.filter((a) => {
    if (f.status && f.status !== 'all' && statusOf(a, now) !== f.status) return false
    if (f.rep && f.rep !== 'all' && String(a.rep_id ?? '') !== f.rep) return false
    if (f.type && f.type !== 'all' && String(a.type ?? '') !== f.type) return false
    if (f.due && f.due !== 'all' && dueStateOf(a, now) !== f.due) return false
    if (!q) return true
    return [a.title, repNameOf(a.rep_id), typeLabel(a.type), a.meta?.coaching_notes].join(' ').toLowerCase().includes(q)
  })
}

const RANK: Record<AssignmentStatus, number> = { overdue: 0, open: 1, completed: 2, cancelled: 3 }

/** Overdue first, then open by soonest due, then completed newest first. Stable for equal keys. */
export function sortAssignments(list: AssignmentLike[], now: Date = new Date()): AssignmentLike[] {
  const t = (s?: string | null, fallback = Infinity) => {
    const n = s ? new Date(s).getTime() : NaN
    return Number.isFinite(n) ? n : fallback
  }
  return list
    .map((a, i) => ({ a, i, s: statusOf(a, now) }))
    .sort((x, y) => {
      if (RANK[x.s] !== RANK[y.s]) return RANK[x.s] - RANK[y.s]
      if (x.s === 'completed' || x.s === 'cancelled') return t(y.a.completed_at ?? y.a.created_at, 0) - t(x.a.completed_at ?? x.a.created_at, 0) || x.i - y.i
      return t(x.a.due_at) - t(y.a.due_at) || x.i - y.i
    })
    .map((x) => x.a)
}

/* ───────────────────── load outcome (what the user is told) ───────────────────── */

export type AssignmentsFailureKind = 'permission' | 'unauthenticated' | 'server' | 'network'
export type AssignmentsFailure = { kind: AssignmentsFailureKind; title: string; body: string; retryable: boolean }

const FAILURES: Record<AssignmentsFailureKind, AssignmentsFailure> = {
  permission: {
    kind: 'permission',
    title: 'You don’t have access to team assignments',
    body: 'Your role doesn’t include the manager assignments view. If you think it should, ask an admin to check your role.',
    retryable: false,
  },
  unauthenticated: {
    kind: 'unauthenticated',
    title: 'Your session has ended',
    body: 'Sign in again to see team assignments.',
    retryable: false,
  },
  server: {
    kind: 'server',
    title: 'Assignments are temporarily unavailable',
    body: 'Something went wrong on our side, not with your account. Your assignments have not changed. Try again in a moment.',
    retryable: true,
  },
  network: {
    kind: 'network',
    title: 'Couldn’t reach Gravix',
    body: 'Check your connection, then try again. Your assignments have not changed.',
    retryable: true,
  },
}

export type AssignmentsResult = { items: AssignmentLike[]; failure: AssignmentsFailure | null }

/**
 * GET /v1/assignments/manager outcome → either the rows or exactly one kind of failure.
 * `status: null` = the request never completed. A 2xx whose body has no list is a server fault, never "no assignments".
 */
export function classifyAssignmentsResult(status: number | null, body: unknown): AssignmentsResult {
  if (status === null) return { items: [], failure: FAILURES.network }
  if (status === 401) return { items: [], failure: FAILURES.unauthenticated }
  if (status === 403) return { items: [], failure: FAILURES.permission }
  const b = body as { ok?: unknown; items?: unknown; assignments?: unknown } | null
  if (status < 200 || status >= 300 || b?.ok === false) return { items: [], failure: FAILURES.server }
  const list = Array.isArray(b?.items) ? b!.items : Array.isArray(b?.assignments) ? b!.assignments : null
  if (!list) return { items: [], failure: FAILURES.server }
  return { items: list as AssignmentLike[], failure: null }
}
