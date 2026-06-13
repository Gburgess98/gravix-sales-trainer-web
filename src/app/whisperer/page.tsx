'use client'

// TIER 2B Day 112 — Live Whisperer with two modes:
//   • Live Listener: browser mic → Deepgram realtime → /segments pipeline
//   • Manual Simulator: typed segments (Day 111 fallback, works without Deepgram)
// The permanent Deepgram key never reaches the browser — a short-lived token is
// minted server-side via POST /v1/whisperer/deepgram-token.

import { useCallback, useEffect, useRef, useState } from 'react'
import { proxyFetch } from '@/lib/api'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyRow } from '@/components/ui/empty-state'

type Speaker = 'prospect' | 'rep'
type Mode = 'live' | 'simulator'
type LiveStatus =
  | 'idle'
  | 'requesting_mic'
  | 'connecting'
  | 'listening'
  | 'reconnecting'
  | 'stopped'
  | 'error'

type TranscriptRow = { id: string; text: string; speaker: Speaker; at: string }
type SuggestionCard = {
  id: string
  type: string
  phrase: string | null
  confidence: number
  title: string
  response: string
  urgency: 'low' | 'medium' | 'high'
  emoji: string | null
  latencyMs: number | null
}

const URGENCY_CLS: Record<string, string> = {
  high: 'border-red-500/30 bg-red-500/10 text-red-300',
  medium: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  low: 'border-neutral-700 bg-neutral-900 text-neutral-300',
}

const LIVE_STATUS_LABEL: Record<LiveStatus, string> = {
  idle: 'Idle',
  requesting_mic: 'Requesting microphone…',
  connecting: 'Connecting to Deepgram…',
  listening: 'Listening',
  reconnecting: 'Reconnecting…',
  stopped: 'Stopped',
  error: 'Error',
}

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
  return candidates.find((m) => MediaRecorder.isTypeSupported(m)) ?? null
}

export default function WhispererPage() {
  const [mode, setMode] = useState<Mode>('live')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionStatus, setSessionStatus] = useState<'idle' | 'active' | 'ended'>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [endSummary, setEndSummary] = useState<string | null>(null)

  // Simulator
  const [input, setInput] = useState('')
  const [speaker, setSpeaker] = useState<Speaker>('prospect')

  // Live listener
  const [liveStatus, setLiveStatus] = useState<LiveStatus>('idle')
  const [interim, setInterim] = useState('')
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  // Reconnect/backoff (Day 113)
  const userStoppedRef = useRef(false)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const RECONNECT_BACKOFF_MS = [500, 1000, 2000]

  // Shared display
  const [transcript, setTranscript] = useState<TranscriptRow[]>([])
  const [suggestions, setSuggestions] = useState<SuggestionCard[]>([])
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null)
  const seq = useRef(0)
  const sessionIdRef = useRef<string | null>(null)
  useEffect(() => { sessionIdRef.current = sessionId }, [sessionId])

  // Post a final transcript segment to the API and render any triggers.
  const postSegment = useCallback(async (text: string, who: Speaker) => {
    const sid = sessionIdRef.current
    const clean = text.trim()
    if (!sid || !clean) return
    const sentAt = new Date()
    try {
      const res = await proxyFetch(
        `/api/proxy/v1/whisperer/sessions/${encodeURIComponent(sid)}/segments`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: clean, speaker: who, clientSentAt: sentAt.toISOString() }),
        }
      )
      const data = await res.json()
      if (!data?.ok) return
      seq.current += 1
      setTranscript((prev) => [...prev, { id: `seg-${seq.current}`, text: clean, speaker: who, at: data.segment.receivedAt }])
      const renderedAt = Date.now()
      const cards: SuggestionCard[] = (data.triggers ?? []).map((t: any) => ({
        id: t.id,
        type: t.type,
        phrase: t.phrase ?? null,
        confidence: t.confidence ?? 0,
        title: t.suggestion?.title ?? 'Suggestion',
        response: t.suggestion?.response ?? '',
        urgency: t.suggestion?.urgency ?? 'low',
        emoji: t.suggestion?.emoji ?? null,
        latencyMs: Math.max(0, renderedAt - sentAt.getTime()),
      }))
      if (cards.length > 0) {
        setSuggestions((prev) => [...cards, ...prev].slice(0, 12))
        setLastLatencyMs(cards[0].latencyMs)
      }
    } catch {
      /* segment best-effort; transcript display unaffected */
    }
  }, [])

  const startSession = useCallback(async () => {
    setBusy(true); setError(null); setEndSummary(null)
    try {
      const res = await proxyFetch('/api/proxy/v1/whisperer/sessions', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!data?.ok) throw new Error(data?.error || 'failed')
      setSessionId(data.session.id)
      setSessionStatus('active')
      setTranscript([]); setSuggestions([]); setLastLatencyMs(null); setInterim('')
    } catch {
      setError('Could not start the session.')
    } finally {
      setBusy(false)
    }
  }, [])

  // ── Live listener ──────────────────────────────────────────────────────────

  // Tear down WS + recorder; optionally keep the mic stream for reconnect.
  const teardownConnection = useCallback((keepStream = false) => {
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null }
    try { recorderRef.current?.stop() } catch {}
    recorderRef.current = null
    try { wsRef.current?.close() } catch {}
    wsRef.current = null
    if (!keepStream) {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setInterim('')
  }, [])

  const teardownListening = useCallback(() => {
    userStoppedRef.current = true
    reconnectAttemptRef.current = 0
    teardownConnection(false)
  }, [teardownConnection])

  // Fetch a fresh short-lived token + open the Deepgram WS, reusing the live
  // mic stream. Used by both initial start and reconnect (token may have
  // expired, so it is always re-minted).
  const connectDeepgram = useCallback(async (mime: string) => {
    const stream = streamRef.current
    if (!stream) return

    setLiveStatus('connecting')
    let token = ''
    try {
      const res = await proxyFetch('/api/proxy/v1/whisperer/deepgram-token', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
      })
      const data = await res.json()
      if (!data?.ok || !data.token) {
        const reason = data?.error === 'deepgram_not_configured'
          ? 'Live transcription is not configured on the server.'
          : 'Live transcription is unavailable right now (token could not be issued).'
        setError(`${reason} The manual simulator still works.`)
        setLiveStatus('error')
        teardownConnection(false)
        return
      }
      token = data.token
    } catch {
      setError('Could not reach the transcription service. The manual simulator still works.')
      setLiveStatus('error')
      teardownConnection(false)
      return
    }

    try {
      const params = new URLSearchParams({
        model: 'nova-3', language: 'en', smart_format: 'true',
        interim_results: 'true', endpointing: '300',
      })
      const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, ['token', token])
      wsRef.current = ws

      ws.onopen = () => {
        reconnectAttemptRef.current = 0 // a clean connection resets the backoff
        setError(null)
        setLiveStatus('listening')
        const recorder = new MediaRecorder(stream, { mimeType: mime })
        recorderRef.current = recorder
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(e.data)
        }
        recorder.start(250) // 250ms chunks
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          const alt = msg?.channel?.alternatives?.[0]
          const text = String(alt?.transcript || '').trim()
          if (!text) return
          if (msg.is_final) {
            setInterim('')
            // Day 112: live segments default to prospect so triggers can fire.
            void postSegment(text, 'prospect')
          } else {
            setInterim(text)
          }
        } catch {
          /* ignore non-JSON keepalives */
        }
      }

      ws.onerror = () => { /* surfaced via onclose → reconnect path */ }

      ws.onclose = () => {
        // Stop the recorder feeding a dead socket, but keep the mic stream.
        try { recorderRef.current?.stop() } catch {}
        recorderRef.current = null
        if (userStoppedRef.current) return // intentional stop — no reconnect

        const attempt = reconnectAttemptRef.current
        if (attempt >= RECONNECT_BACKOFF_MS.length) {
          setError('Live transcription stopped. You can restart listening or use the manual simulator.')
          setLiveStatus('error')
          teardownConnection(false)
          return
        }
        const delay = RECONNECT_BACKOFF_MS[attempt]
        reconnectAttemptRef.current = attempt + 1
        setLiveStatus('reconnecting')
        setError('Connection dropped. Reconnecting…')
        reconnectTimerRef.current = setTimeout(() => {
          if (!userStoppedRef.current && streamRef.current) void connectDeepgram(mime)
        }, delay)
      }
    } catch {
      setError('Could not open the live transcription stream.')
      setLiveStatus('error')
      teardownConnection(false)
    }
  }, [postSegment, teardownConnection])

  const startListening = useCallback(async () => {
    if (!sessionId) return
    setError(null)
    userStoppedRef.current = false
    reconnectAttemptRef.current = 0

    const mime = pickMimeType()
    if (!mime) {
      setError('This browser does not support live audio capture. Use the manual simulator.')
      setLiveStatus('error')
      return
    }

    // Mic permission (reused across reconnects)
    setLiveStatus('requesting_mic')
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('Microphone permission was denied. Use the manual simulator instead.')
      setLiveStatus('error')
      return
    }

    await connectDeepgram(mime)
  }, [sessionId, connectDeepgram])

  const stopListening = useCallback(() => {
    teardownListening()
    setLiveStatus('stopped')
  }, [teardownListening])

  // Clean up media/socket/timers on unmount
  useEffect(() => () => { teardownListening() }, [teardownListening])

  // ── Simulator ───────────────────────────────────────────────────────────────

  const sendSegment = useCallback(async () => {
    const text = input.trim()
    if (!text || busy) return
    setBusy(true)
    await postSegment(text, speaker)
    setInput('')
    setBusy(false)
  }, [input, speaker, busy, postSegment])

  // ── End session ──────────────────────────────────────────────────────────────

  const endSession = useCallback(async () => {
    if (!sessionId || busy) return
    setBusy(true)
    teardownListening()
    setLiveStatus('idle')
    try {
      const res = await proxyFetch(
        `/api/proxy/v1/whisperer/sessions/${encodeURIComponent(sessionId)}/end`,
        { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }
      )
      const data = await res.json()
      if (data?.ok) {
        setSessionStatus('ended')
        const p50 = data.session?.latency_p50_ms
        setEndSummary(
          `Session ended — ${transcript.length} segment${transcript.length === 1 ? '' : 's'}, ` +
          `${suggestions.length} suggestion${suggestions.length === 1 ? '' : 's'}` +
          (typeof p50 === 'number' ? `, p50 latency ${p50}ms` : '')
        )
      }
    } catch {
      setError('Could not end the session.')
    } finally {
      setBusy(false)
    }
  }, [sessionId, busy, transcript.length, suggestions.length, teardownListening])

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-white">Live Whisperer</h1>
          <p className="mt-1 text-sm text-neutral-500 max-w-2xl">
            Gravix listens for buyer objections and gives live coaching suggestions. It does not place
            or manage the call. Only use this on calls where recording/listening is permitted.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-300">
            <span className={`h-1.5 w-1.5 rounded-full ${liveStatus === 'listening' ? 'bg-emerald-400 animate-pulse' : sessionStatus === 'active' ? 'bg-emerald-400' : 'bg-neutral-600'}`} />
            {sessionStatus === 'active' ? (mode === 'live' ? LIVE_STATUS_LABEL[liveStatus] : 'Simulator') : sessionStatus === 'ended' ? 'Session ended' : 'Idle'}
          </span>
          {lastLatencyMs !== null && (
            <span
              className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300"
              title="Time from sending the line to the suggestion appearing"
            >
              Last suggestion latency {lastLatencyMs}ms
            </span>
          )}
        </div>
      </div>

      {/* Mode toggle */}
      <div className="inline-flex rounded-lg border border-neutral-800 bg-neutral-950 p-0.5 text-xs">
        {(['live', 'simulator'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { if (m !== mode) { teardownListening(); setLiveStatus('idle'); setMode(m) } }}
            className={`rounded-md px-3 py-1.5 font-medium transition-colors ${mode === m ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-400 hover:text-neutral-200'}`}
          >
            {m === 'live' ? 'Live Listener' : 'Manual Simulator'}
          </button>
        ))}
      </div>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">{error}</div>}
      {endSummary && <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">{endSummary}</div>}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <SectionCard
          title={mode === 'live' ? 'Live Listener' : 'Transcript simulator'}
          subtitle={mode === 'live' ? 'Microphone audio is transcribed live; only final lines are analysed.' : 'Type what the prospect (or you) just said.'}
        >
          {sessionStatus !== 'active' ? (
            <button
              type="button"
              onClick={startSession}
              disabled={busy}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
            >
              {busy ? 'Starting…' : 'Start session'}
            </button>
          ) : (
            <div className="space-y-3">
              {mode === 'live' ? (
                <div className="flex flex-wrap items-center gap-2">
                  {liveStatus !== 'listening' ? (
                    <button
                      type="button"
                      onClick={startListening}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors"
                    >
                      Start listening
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={stopListening}
                      className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/20 transition-colors"
                    >
                      Stop listening
                    </button>
                  )}
                  <span className="text-xs text-neutral-500">{LIVE_STATUS_LABEL[liveStatus]}</span>
                </div>
              ) : (
                <div className="flex gap-2">
                  <select
                    value={speaker}
                    onChange={(e) => setSpeaker(e.target.value as Speaker)}
                    className="rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-2 text-xs text-neutral-200"
                  >
                    <option value="prospect">Prospect</option>
                    <option value="rep">Rep</option>
                  </select>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') sendSegment() }}
                    placeholder="Paste or type a prospect line…"
                    className="flex-1 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={sendSegment}
                    disabled={busy || !input.trim()}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
                  >
                    Send segment
                  </button>
                </div>
              )}

              {mode === 'live' && interim && (
                <div className="rounded-lg border border-dashed border-neutral-800 bg-neutral-900/20 px-3 py-2 text-sm text-neutral-500 italic">
                  {interim}…
                </div>
              )}

              <div className="max-h-72 space-y-1.5 overflow-y-auto">
                {transcript.length === 0 ? (
                  <div className="text-xs text-neutral-500 py-2">No transcript yet — {mode === 'live' ? 'start listening' : 'send a line'} to begin.</div>
                ) : (
                  transcript.map((row) => (
                    <div key={row.id} className="rounded-lg border border-neutral-800 bg-neutral-900/30 px-3 py-2 text-sm">
                      <span className={`mr-2 text-[10px] uppercase tracking-wide font-semibold ${row.speaker === 'prospect' ? 'text-amber-300' : 'text-emerald-300'}`}>
                        {row.speaker}
                      </span>
                      <span className="text-neutral-200">{row.text}</span>
                    </div>
                  ))
                )}
              </div>

              <button
                type="button"
                onClick={endSession}
                disabled={busy}
                className="rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-900 transition-colors disabled:opacity-50"
              >
                End session
              </button>
            </div>
          )}
        </SectionCard>

        <SectionCard variant="ai" title="Suggestions" subtitle="Trigger detected → suggested response.">
          {suggestions.length === 0 ? (
            <EmptyRow message="No suggestions yet." />
          ) : (
            <div className="space-y-2">
              {suggestions.map((s) => (
                <div key={s.id} className="rounded-lg border border-neutral-800 bg-neutral-900/30 px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-white">{s.emoji ? `${s.emoji} ` : ''}{s.title}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border uppercase tracking-wide font-semibold shrink-0 ${URGENCY_CLS[s.urgency]}`}>{s.urgency}</span>
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    Trigger detected: <span className="text-neutral-300">{s.type}</span>
                    {s.phrase ? <> · “{s.phrase}”</> : null}
                    {s.latencyMs !== null && <> · {s.latencyMs}ms</>}
                  </div>
                  <p className="text-xs text-neutral-200 leading-relaxed">{s.response}</p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
