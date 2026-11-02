'use client'

// Mission briefing: the last step before a live session. Shows objective, difficulty, pass condition and
// microphone readiness. "Begin session" calls the SAME start flow as the existing sparring entry.

import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { buttonClasses } from '@/components/ui/button'
import { ProvenanceChip } from './ProvenanceChip'
import { DifficultyPips } from './PersonaCarousel'
import {
  DIFFICULTY_META,
  PASS_SCORE,
  normaliseDifficulty,
  presentationFor,
  type ApiPersona,
  type ArenaMode,
  type Difficulty,
  type MicState,
} from '@/lib/sparring-arena'

const MODES: { id: ArenaMode; label: string; hint: string }[] = [
  { id: 'standard', label: 'Standard round', hint: 'Open-ended conversation.' },
  { id: 'time_trial', label: 'Time trial', hint: 'Speed drill.' },
  { id: 'close_2m', label: 'Close in 2 minutes', hint: 'Two-minute closing drill.' },
]

const MIC_COPY: Record<MicState, string> = {
  unknown: 'Not checked yet.',
  granted: 'Microphone ready.',
  prompt: 'Your browser will ask for permission when you test.',
  denied: 'Microphone blocked. Allow it in your browser settings if you want to use voice.',
  unsupported: 'This browser cannot access a microphone.',
}

interface Props {
  persona: ApiPersona
  initialDifficulty: Difficulty
  assignmentId?: string | null
  busy: boolean
  error: string | null
  onCancel: () => void
  onBegin: (opts: { mode: ArenaMode; difficulty: Difficulty }) => void
}

export function MissionBriefing({ persona, initialDifficulty, assignmentId, busy, error, onCancel, onBegin }: Props) {
  const p = presentationFor(persona)
  const [mode, setMode] = useState<ArenaMode>('standard')
  const [difficulty, setDifficulty] = useState<Difficulty>(initialDifficulty)
  const [mic, setMic] = useState<MicState>('unknown')
  const headingRef = useRef<HTMLHeadingElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)

  // Focus the dialog on open; Escape cancels; Tab is kept inside the dialog.
  useEffect(() => {
    headingRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) return onCancel()
      if (e.key !== 'Tab' || !dialogRef.current) return
      const f = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex="0"]')]
      if (!f.length) return
      const first = f[0]
      const last = f[f.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  // Read the current permission state without prompting.
  useEffect(() => {
    let cancelled = false
    if (!navigator.mediaDevices?.getUserMedia) return setMic('unsupported')
    navigator.permissions
      ?.query({ name: 'microphone' as PermissionName })
      .then((s) => !cancelled && setMic(s.state as MicState))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  async function testMic() {
    if (!navigator.mediaDevices?.getUserMedia) return setMic('unsupported')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop()) // release immediately; we only test access
      setMic('granted')
    } catch {
      setMic('denied')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#02040c]/80 p-0 sm:items-center sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="briefing-title"
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-cyan-400/40 bg-[#070d1f] p-6 shadow-[0_0_60px_-20px_rgba(34,211,238,0.45)] sm:rounded-2xl"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">Mission briefing</p>
        <h2 id="briefing-title" ref={headingRef} tabIndex={-1} className="mt-1 text-xl font-semibold text-white outline-none">
          {persona.label}
          <span className="ml-2 text-sm font-normal text-slate-300">· {p.role}</span>
        </h2>

        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-slate-300">Objective <ProvenanceChip kind="placeholder" /></dt>
            <dd className="mt-1 text-sm text-slate-100">{p.objective}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-slate-300">Pass condition</dt>
            <dd className="mt-1 text-sm text-slate-100">
              Finish with a score of <strong className="text-white">{PASS_SCORE}/100 or higher</strong> to defeat this persona.
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-slate-300">Difficulty</dt>
            <dd className="mt-1.5">
              <div role="radiogroup" aria-label="Difficulty" className="flex flex-wrap gap-2">
                {(Object.keys(DIFFICULTY_META) as Difficulty[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={difficulty === d}
                    onClick={() => setDifficulty(d)}
                    className={clsx(
                      'rounded-full border px-3 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300',
                      difficulty === d ? 'border-cyan-300 bg-cyan-400/15 text-white' : 'border-slate-600 text-slate-200 hover:border-slate-400',
                    )}
                  >
                    {DIFFICULTY_META[d].label}
                  </button>
                ))}
              </div>
              <div className="mt-2"><DifficultyPips difficulty={difficulty} /></div>
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wider text-slate-300">Round type</dt>
            <dd className="mt-1.5">
              <div role="radiogroup" aria-label="Round type" className="space-y-1.5">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={mode === m.id}
                    onClick={() => setMode(m.id)}
                    className={clsx(
                      'flex w-full items-center justify-between rounded-lg border px-3 py-1.5 text-left text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300',
                      mode === m.id ? 'border-cyan-300 bg-cyan-400/15 text-white' : 'border-slate-600 text-slate-200 hover:border-slate-400',
                    )}
                  >
                    <span className="font-medium">{m.label}</span>
                    <span className="text-slate-300">{m.hint}</span>
                  </button>
                ))}
              </div>
            </dd>
          </div>
        </dl>

        <section aria-labelledby="mic-h" className="mt-5 rounded-xl border border-slate-600/70 bg-[#050a18] p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 id="mic-h" className="text-sm font-semibold text-white">Microphone readiness</h3>
              <p className="text-xs text-slate-200" role="status">{MIC_COPY[mic]}</p>
            </div>
            <button type="button" onClick={testMic} className={buttonClasses('ghost', 'md')}>
              Test microphone
            </button>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-300">
            Today&apos;s sparring session is a text conversation, so a microphone is optional. This check is for readiness only.
          </p>
        </section>

        {assignmentId && (
          <p className="mt-3 text-xs text-cyan-100">This round will count towards your assigned drill.</p>
        )}
        {error && (
          <p role="alert" className="mt-3 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className={buttonClasses('ghost', 'md')}>
            Back to arena
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onBegin({ mode, difficulty: normaliseDifficulty(difficulty) })}
            className={buttonClasses('primary', 'md')}
          >
            {busy ? 'Starting…' : 'Begin session'}
          </button>
        </div>
      </div>
    </div>
  )
}
