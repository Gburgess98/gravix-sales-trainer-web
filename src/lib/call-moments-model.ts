// Pure model for the call-review "moments ↔ transcript" experience. No React, no network.
// It only reshapes data the call already carries (`analysis_json.moments`, `analysis_json.transcript.segments`, pins);
// it never invents a moment, a timestamp or a speaker. Unit-tested in tests/unit/call-moments-model.test.mts.

export type Severity = 'high' | 'medium' | 'low'

export type Moment = {
  key: string
  /** Seconds into the call, or null when the scorer gave no usable timestamp. */
  seconds: number | null
  /** Human label, e.g. "Objection raised". */
  label: string
  text: string
  severity: Severity
}

export type Segment = {
  /** Index in the ORIGINAL segment array — stable, used for `#transcript-seg-N` anchors. */
  index: number
  start: number | null
  speaker: string
  text: string
}

export type Marker = { kind: 'pin' | 'moment'; seconds: number; label: string }

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/** m:ss, or h:mm:ss from one hour. Never NaN. */
export function clock(sec: number | null | undefined): string {
  if (typeof sec !== 'number' || !Number.isFinite(sec) || sec < 0) return '—'
  const s = Math.floor(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}

export function looksLikeId(v: unknown): boolean {
  return typeof v === 'string' && UUID.test(v)
}

/** "intro-basics" / "objection_too_expensive" → "Intro basics". */
export function humaniseSlug(v: string): string {
  const s = v.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

/** A label that is safe to show: never a UUID, never empty. */
export function safeLabel(v: unknown, fallback: string): string {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!s || looksLikeId(s)) return fallback
  return s
}

export function typeLabel(type: unknown): string {
  const raw = typeof type === 'string' ? type.trim() : ''
  if (!raw) return 'Moment'
  const s = humaniseSlug(raw)
  return /^moment$/i.test(s) ? 'Moment' : s
}

const SEV_WEIGHT: Record<Severity, number> = { high: 3, medium: 2, low: 1 }

function severityOf(v: unknown): Severity {
  const s = String(v ?? '').toLowerCase()
  return s === 'high' || s === 'low' ? s : 'medium'
}

/** `analysis_json.moments` is untrusted: anything malformed is dropped, never guessed. */
export function normaliseMoments(raw: unknown): Moment[] {
  if (!Array.isArray(raw)) return []
  const out: Moment[] = []
  raw.forEach((m, i) => {
    if (!m || typeof m !== 'object') return
    const o = m as Record<string, unknown>
    const text = typeof o.text === 'string' ? o.text.trim().slice(0, 600) : ''
    if (!text) return
    const ts = typeof o.timestamp === 'number' && Number.isFinite(o.timestamp) && o.timestamp >= 0 ? o.timestamp : null
    out.push({ key: `m${i}`, seconds: ts, label: typeLabel(o.type), text, severity: severityOf(o.severity) })
  })
  return out
}

/** Most important first (severity, then earliest). Untimed moments sort after timed ones of the same severity. */
export function rankMoments(moments: Moment[], max: number): { top: Moment[]; rest: Moment[] } {
  const sorted = [...moments].sort((a, b) => {
    const w = SEV_WEIGHT[b.severity] - SEV_WEIGHT[a.severity]
    if (w) return w
    if (a.seconds === null && b.seconds === null) return 0
    if (a.seconds === null) return 1
    if (b.seconds === null) return -1
    return a.seconds - b.seconds
  })
  const top = sorted.slice(0, Math.max(0, max))
  const rest = sorted.slice(top.length).sort((a, b) => (a.seconds ?? Infinity) - (b.seconds ?? Infinity))
  return { top, rest }
}

/** Speaker labels from the transcriber are shown as-is when meaningful; blanks become "Speaker". */
export function normaliseSegments(raw: unknown): Segment[] {
  if (!Array.isArray(raw)) return []
  const out: Segment[] = []
  raw.forEach((s, index) => {
    if (!s || typeof s !== 'object') return
    const o = s as Record<string, unknown>
    const text = typeof o.text === 'string' ? o.text.trim() : ''
    if (!text) return
    const speaker = typeof o.speaker === 'string' && o.speaker.trim() ? o.speaker.trim() : 'Speaker'
    const start = typeof o.start_sec === 'number' && Number.isFinite(o.start_sec) && o.start_sec >= 0 ? o.start_sec : null
    out.push({ index, start, speaker, text })
  })
  return out
}

/** Index (original) of the segment spoken at `sec` — the last one starting at or before it. null when nothing is timed or nothing has started. */
export function segmentIndexAt(segments: Segment[], sec: number | null | undefined): number | null {
  if (typeof sec !== 'number' || !Number.isFinite(sec) || sec < 0) return null
  let best: Segment | null = null
  for (const s of segments) {
    if (s.start === null || s.start > sec) continue
    if (!best || (best.start as number) <= s.start) best = s
  }
  return best ? best.index : null
}

/** Markers to draw inside the transcript, keyed by the segment they fall in. Items with no timestamp or no matching segment are omitted (they stay in their own list). */
export function markersBySegment(segments: Segment[], moments: Moment[], pins: { t: number; note: string | null }[]): Record<number, Marker[]> {
  const map: Record<number, Marker[]> = {}
  const add = (idx: number | null, m: Marker) => {
    if (idx === null) return
    ;(map[idx] ||= []).push(m)
  }
  for (const m of moments) if (m.seconds !== null) add(segmentIndexAt(segments, m.seconds), { kind: 'moment', seconds: m.seconds, label: m.label })
  for (const p of pins) if (Number.isFinite(p.t)) add(segmentIndexAt(segments, p.t), { kind: 'pin', seconds: p.t, label: p.note?.trim() || 'Pin' })
  return map
}

/** True when at least one segment carries a start time (so timestamps and jumping make sense). */
export function hasTimedSegments(segments: Segment[]): boolean {
  return segments.some((s) => s.start !== null)
}

/** What the transcript area should say when there is nothing to read, by call status. */
export function transcriptEmptyCopy(status: string | null | undefined): { message: string; sub: string } {
  switch (status) {
    case 'failed':
      return { message: 'No transcript is available because processing didn’t finish.', sub: 'The recording could not be transcribed. Upload it again to retry.' }
    case 'queued':
    case 'processing':
    case 'processed':
    case 'scoring':
      return { message: 'The transcript isn’t ready yet.', sub: 'It appears here automatically once processing completes.' }
    default:
      return { message: 'No transcript has been generated for this call yet.', sub: 'The transcript appears here automatically once processing completes.' }
  }
}
