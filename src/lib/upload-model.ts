// Pure model for the /upload workflow: file rules, stage vocabulary, calm failure copy and the small
// "resume after refresh" record. No React, no network — unit-tested in tests/unit/upload-model.test.mts.
//
// The limits mirror what the API actually enforces (gravix-sales-trainer-api src/server.ts):
//   • ALLOWED_UPLOAD_MIMES — /v1/upload/signed answers 415 `unsupported_file_type` for anything else
//   • MAX_UPLOAD_BYTES = 50 MB — the API's documented per-file maximum (the previous 100 MB client guardrail
//     promised more than the API states)

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

/** Mirrors the API's ALLOWED_UPLOAD_MIMES. */
export const ALLOWED_MIMES: readonly string[] = [
  'audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a',
  'audio/aac', 'audio/x-aac', 'audio/ogg', 'audio/webm', 'audio/flac', 'audio/x-flac',
  'video/webm', 'video/mp4', 'application/json', 'application/octet-stream',
]

/** Extensions the picker offers. `.json` is a ready-made transcript. */
export const ALLOWED_EXTENSIONS: readonly string[] = ['.wav', '.mp3', '.m4a', '.mp4', '.aac', '.ogg', '.webm', '.flac', '.json']

export const FILE_INPUT_ACCEPT = ALLOWED_EXTENSIONS.join(',')
export const ACCEPTED_TYPES_LABEL = 'WAV, MP3, M4A, MP4, AAC, OGG, WebM or FLAC audio, or a transcript as JSON'
export const MAX_SIZE_LABEL = '50 MB'

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export type FileProblem = { code: 'empty' | 'type' | 'size'; message: string }
type FileLike = { name: string; size: number; type?: string }

/** `null` = acceptable. Messages say what is wrong and what to do; they never echo raw codes. */
export function validateRecording(file: FileLike): FileProblem | null {
  const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')).toLowerCase() : ''
  const mime = (file.type || '').toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(ext) || (mime && !ALLOWED_MIMES.includes(mime))) {
    return { code: 'type', message: `“${file.name}” isn’t a supported file type. Choose ${ACCEPTED_TYPES_LABEL}.` }
  }
  if (file.size <= 0) return { code: 'empty', message: `“${file.name}” is empty. Choose a recording that has audio in it.` }
  if (file.size > MAX_UPLOAD_BYTES) {
    return { code: 'size', message: `“${file.name}” is ${formatBytes(file.size)}. The limit is ${MAX_SIZE_LABEL}. Export a shorter or compressed copy and try again.` }
  }
  return null
}

/** What is still missing before Upload can be pressed — drives the helper text next to the button. */
export function missingForUpload(input: { hasFile: boolean }): string[] {
  return input.hasFile ? [] : ['a recording']
}

// ── Stages ──────────────────────────────────────────────────────────────────────────────────────────────────

export type RunStage = 'preparing' | 'uploading' | 'finalising' | 'processing'
export const RUN_STAGES: readonly { id: RunStage; label: string }[] = [
  { id: 'preparing', label: 'Preparing' },
  { id: 'uploading', label: 'Uploading' },
  { id: 'finalising', label: 'Finalising' },
  { id: 'processing', label: 'Processing' },
]

export function stageStatus(stage: RunStage, current: RunStage | 'completed' | 'failed', failedAt?: RunStage | null): 'done' | 'current' | 'upcoming' | 'failed' {
  const order = RUN_STAGES.map((s) => s.id)
  if (current === 'completed') return 'done'
  if (current === 'failed') {
    const f = failedAt ? order.indexOf(failedAt) : -1
    const i = order.indexOf(stage)
    return i < f ? 'done' : i === f ? 'failed' : 'upcoming'
  }
  const c = order.indexOf(current)
  const i = order.indexOf(stage)
  return i < c ? 'done' : i === c ? 'current' : 'upcoming'
}

/** Screen-reader announcement for a stage change. Upload percent is announced in quarters only, to avoid chatter. */
export function stageAnnouncement(stage: RunStage, percent: number): string {
  switch (stage) {
    case 'preparing': return 'Preparing your upload.'
    case 'uploading': return `Uploading. ${Math.min(100, Math.floor(percent / 25) * 25)} percent.`
    case 'finalising': return 'Upload received. Finalising.'
    case 'processing': return 'Processing the call.'
  }
}

// ── Failure copy ────────────────────────────────────────────────────────────────────────────────────────────

export type Failure = {
  title: string
  detail: string
  /** True when the recording is already saved, so retrying must NOT upload (or create a call) again. */
  saved: boolean
}

const text = (err: unknown): string => {
  if (typeof err === 'string') return err
  if (err && typeof err === 'object') {
    const o = err as { message?: unknown; error?: unknown }
    return String(o.message ?? o.error ?? '')
  }
  return ''
}

/** Calm failure copy by stage. Raw storage/API/job text is matched but never returned. */
export function describeFailure(stage: RunStage, err: unknown): Failure {
  const t = text(err)
  if (/missing_user|jwt|token|\b401\b|not signed in/i.test(t)) {
    return { title: 'Your session has expired', detail: 'Sign in again, then upload your recording.', saved: stage === 'processing' }
  }
  if (/unsupported_file_type|\b415\b/i.test(t)) return { title: 'This file type isn’t supported', detail: `Choose ${ACCEPTED_TYPES_LABEL}.`, saved: false }
  if (/upload_hierarchy_incomplete/i.test(t)) return { title: 'Your account isn’t set up for uploads yet', detail: 'Ask an administrator to add you to your organisation, then try again. Nothing was saved.', saved: false }
  if (/\b429\b/.test(t)) return { title: 'Too many requests', detail: 'Wait a minute, then try again.', saved: stage === 'processing' || stage === 'finalising' }
  switch (stage) {
    case 'preparing':
      return { title: 'We couldn’t start the upload', detail: 'Check your connection and try again. Nothing was saved.', saved: false }
    case 'uploading':
      return { title: 'The upload didn’t finish', detail: 'Your connection may have dropped. Nothing was saved, so it’s safe to try again.', saved: false }
    case 'finalising':
      return { title: 'The file arrived, but the call wasn’t created', detail: 'Your recording is safe. Try again to finish — it won’t be uploaded twice.', saved: true }
    case 'processing':
      return { title: 'Processing didn’t finish', detail: 'Your recording is saved. Check again in a moment, or find it under Uploads in Calls.', saved: true }
  }
}

// ── Resume after refresh ────────────────────────────────────────────────────────────────────────────────────

export const PENDING_KEY = 'gravix:upload:pending'
export const PENDING_MAX_AGE_MS = 2 * 60 * 60 * 1000

export type PendingUpload = { callId: string; jobId: string | null; filename: string; at: number }

export function serializePending(p: PendingUpload): string {
  return JSON.stringify(p)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Returns null for anything malformed, stale or not shaped exactly as written by `serializePending`. */
export function parsePending(raw: string | null, now = Date.now()): PendingUpload | null {
  if (!raw) return null
  try {
    const o = JSON.parse(raw) as Partial<PendingUpload>
    if (typeof o.callId !== 'string' || !UUID.test(o.callId)) return null
    if (o.jobId != null && (typeof o.jobId !== 'string' || !UUID.test(o.jobId))) return null
    if (typeof o.filename !== 'string' || typeof o.at !== 'number') return null
    if (now - o.at > PENDING_MAX_AGE_MS || o.at > now + 60_000) return null
    return { callId: o.callId, jobId: o.jobId ?? null, filename: o.filename.slice(0, 200), at: o.at }
  } catch {
    return null
  }
}

/** The signed-upload path is `<userId>/<callId>.<ext>`; finalize creates the call with that id. */
export function callIdFromPath(path: string): string {
  return (path.split('/').pop() || '').split('.')[0]
}
