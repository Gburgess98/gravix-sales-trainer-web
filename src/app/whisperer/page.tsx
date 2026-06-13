'use client'

// TIER 2B Day 111 — Live Whisperer (transcript stub loop).
// Dev simulator: typed segments stand in for the mic until Deepgram lands
// (Day 112/113). Proves segment → trigger → suggestion → latency → display.

import { useCallback, useRef, useState } from 'react'
import { proxyFetch } from '@/lib/api'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyRow } from '@/components/ui/empty-state'

type Speaker = 'prospect' | 'rep'

type TranscriptRow = {
  id: string
  text: string
  speaker: Speaker
  at: string
}

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

export default function WhispererPage() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionStatus, setSessionStatus] = useState<'idle' | 'active' | 'ended'>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [input, setInput] = useState('')
  const [speaker, setSpeaker] = useState<Speaker>('prospect')
  const [transcript, setTranscript] = useState<TranscriptRow[]>([])
  const [suggestions, setSuggestions] = useState<SuggestionCard[]>([])
  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null)
  const [endSummary, setEndSummary] = useState<string | null>(null)
  const seq = useRef(0)

  const startSession = useCallback(async () => {
    setBusy(true)
    setError(null)
    setEndSummary(null)
    try {
      const res = await proxyFetch('/api/proxy/v1/whisperer/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (!data?.ok) throw new Error(data?.error || 'failed')
      setSessionId(data.session.id)
      setSessionStatus('active')
      setTranscript([])
      setSuggestions([])
      setLastLatencyMs(null)
    } catch (e: any) {
      setError('Could not start the session.')
    } finally {
      setBusy(false)
    }
  }, [])

  const sendSegment = useCallback(async () => {
    const text = input.trim()
    if (!text || !sessionId || busy) return
    setBusy(true)
    setError(null)
    const sentAt = new Date()
    try {
      const res = await proxyFetch(
        `/api/proxy/v1/whisperer/sessions/${encodeURIComponent(sessionId)}/segments`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text, speaker, clientSentAt: sentAt.toISOString() }),
        }
      )
      const data = await res.json()
      if (!data?.ok) throw new Error(data?.error || 'failed')

      seq.current += 1
      setTranscript((prev) => [
        ...prev,
        { id: `seg-${seq.current}`, text, speaker, at: data.segment.receivedAt },
      ])
      setInput('')

      const renderedAt = Date.now()
      const newCards: SuggestionCard[] = (data.triggers ?? []).map((t: any) => ({
        id: t.id,
        type: t.type,
        phrase: t.phrase ?? null,
        confidence: t.confidence ?? 0,
        title: t.suggestion?.title ?? 'Suggestion',
        response: t.suggestion?.response ?? '',
        urgency: t.suggestion?.urgency ?? 'low',
        emoji: t.suggestion?.emoji ?? null,
        // Full client-observed latency: typed → suggestion rendered
        latencyMs: Math.max(0, renderedAt - sentAt.getTime()),
      }))
      if (newCards.length > 0) {
        setSuggestions((prev) => [...newCards, ...prev].slice(0, 12))
        setLastLatencyMs(newCards[0].latencyMs)
      }
    } catch {
      setError('Could not send the segment.')
    } finally {
      setBusy(false)
    }
  }, [input, sessionId, speaker, busy])

  const endSession = useCallback(async () => {
    if (!sessionId || busy) return
    setBusy(true)
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
  }, [sessionId, busy, transcript.length, suggestions.length])

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-white">Live Whisperer</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Real-time prompts while you sell. Stub mode — typed segments stand in for the
            microphone until live transcription lands.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-700 bg-neutral-900 px-3 py-1 text-xs text-neutral-300">
            <span className={`h-1.5 w-1.5 rounded-full ${sessionStatus === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-600'}`} />
            {sessionStatus === 'active' ? 'Listening (simulator)' : sessionStatus === 'ended' ? 'Session ended' : 'Stub mode'}
          </span>
          {lastLatencyMs !== null && (
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
              Latency {lastLatencyMs}ms
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">{error}</div>
      )}
      {endSummary && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">{endSummary}</div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        {/* Transcript simulator */}
        <SectionCard title="Transcript simulator" subtitle="Type what the prospect (or you) just said.">
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

              <div className="max-h-80 space-y-1.5 overflow-y-auto">
                {transcript.length === 0 ? (
                  <div className="text-xs text-neutral-500 py-2">No transcript yet — send a line to begin.</div>
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

        {/* Suggestions */}
        <SectionCard variant="ai" title="Suggestions" subtitle="Trigger detected → suggested response.">
          {suggestions.length === 0 ? (
            <EmptyRow message="No suggestions yet." />
          ) : (
            <div className="space-y-2">
              {suggestions.map((s) => (
                <div key={s.id} className="rounded-lg border border-neutral-800 bg-neutral-900/30 px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-white">
                      {s.emoji ? `${s.emoji} ` : ''}{s.title}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border uppercase tracking-wide font-semibold shrink-0 ${URGENCY_CLS[s.urgency]}`}>
                      {s.urgency}
                    </span>
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
