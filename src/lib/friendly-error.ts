// User-facing error copy. Raw backend or runtime text (API codes like `missing_user`, `Missing or invalid x-org-id`,
// `HTTP 500`, `Cannot read properties of undefined`) must never reach the screen. Pass anything that failed — an Error,
// a response-like object, a string — and get calm copy back. The raw value is for logs only.

const NETWORK = /failed to fetch|fetch failed|networkerror|network request failed|load failed|econnrefused|timeout|timed out|aborted/i

/** The HTTP status carried by the failure, if any (`status` field, or a 3-digit code in the text). */
export function statusOf(err: unknown): number | null {
  if (err && typeof err === 'object') {
    const s = (err as { status?: unknown }).status
    if (typeof s === 'number') return s
  }
  const m = /\b(40[0-9]|41[0-9]|42[0-9]|50[0-9])\b/.exec(textOf(err))
  return m ? Number(m[1]) : null
}

function textOf(err: unknown): string {
  if (typeof err === 'string') return err
  if (err && typeof err === 'object') {
    const o = err as { message?: unknown; error?: unknown }
    return String(o.message ?? o.error ?? '')
  }
  return ''
}

/** Calm, generic copy by failure type. Specific wording comes from `fallback`; nothing from the raw text is ever returned. */
export function friendlyError(err: unknown, fallback: string): string {
  const text = textOf(err)
  const status = statusOf(err)
  if (status === 401 || /missing_user|missing_user_identity|not signed in|jwt|token/i.test(text)) return 'Your session has expired. Sign in again to continue.'
  if (status === 403 || /forbidden|not_manager|not allowed|permission/i.test(text)) return 'You don’t have access to this.'
  if (status === 404 || /not_found|not found/i.test(text)) return 'We couldn’t find that. It may have been removed.'
  if (status === 429) return 'Too many requests. Wait a moment and try again.'
  if (NETWORK.test(text)) return 'Can’t reach the server. Check your connection and try again.'
  return fallback
}
