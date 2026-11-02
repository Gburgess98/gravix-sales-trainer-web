// Pure helpers shared by the glass-pilot screens (Home, Calls, Call Review). No React, no I/O.

export type Tone = 'neutral' | 'info' | 'good' | 'warn' | 'bad'

export type CallState = { kind: 'scored' | 'processing' | 'failed'; label: string; tone: Tone }

/** Map the API's free-form call status onto the three states the UI distinguishes. */
export function callState(status: string | null | undefined): CallState {
  const s = String(status ?? '').toLowerCase()
  if (s === 'failed' || s === 'error') return { kind: 'failed', label: 'Failed', tone: 'bad' }
  if (s === 'processing' || s === 'queued' || s === 'running' || s === 'pending' || s === 'uploaded') {
    return { kind: 'processing', label: 'Processing', tone: 'warn' }
  }
  return { kind: 'scored', label: 'Scored', tone: 'good' }
}

/** Score colour is meaningful status: 80+ good, 60–79 caution, below 60 needs work. */
export function scoreTone(score: number | null | undefined): Tone {
  if (typeof score !== 'number' || !Number.isFinite(score)) return 'neutral'
  if (score >= 80) return 'good'
  if (score >= 60) return 'warn'
  return 'bad'
}

export function formatDuration(ms?: number | null, sec?: number | null): string | null {
  const total = ms && ms > 0 ? Math.floor(ms / 1000) : sec && sec > 0 ? Math.floor(sec) : 0
  if (!total) return null
  const m = Math.floor(total / 60)
  const s = total % 60
  return m === 0 ? `${s}s` : `${m}m ${String(s).padStart(2, '0')}s`
}

/** "Today, 14:05" / "Yesterday" / "12 Oct" / "12 Oct 2025". */
export function formatCallDate(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000)
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  if (days === 0) return `Today, ${time}`
  if (days === 1) return 'Yesterday'
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric'
  return d.toLocaleDateString('en-GB', opts)
}

export function firstName(name: string | null | undefined): string | null {
  const n = String(name ?? '').trim().split(/\s+/)[0]
  return n || null
}

export function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export type StageNote = { label: string; score: number | null; note: string | null }

/**
 * Up to three coaching priorities, derived ONLY from existing stage data: lowest-scoring stages first,
 * each with its own coaching note when one exists. Stages without a score sort last; nothing is invented.
 */
export function coachingPriorities(stages: StageNote[], max = 3): StageNote[] {
  return stages
    .filter((s) => s.note || typeof s.score === 'number')
    .slice()
    .sort((a, b) => (a.score ?? Infinity) - (b.score ?? Infinity))
    .slice(0, max)
}
