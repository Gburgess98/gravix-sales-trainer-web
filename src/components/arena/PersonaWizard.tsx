'use client'

// Create / edit a private persona in four short steps. Prototype storage: this browser only (see
// docs/sparring-arena/PRIVATE_PERSONAS_API.md). Team submission is deliberately unavailable until the API exists.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { clsx } from 'clsx'
import { proxyFetch } from '@/lib/api'
import { PageContainer } from '@/components/layout/page-container'
import { buttonClasses } from '@/components/ui/button'
import styles from './arena.module.css'
import { DifficultyPips } from './PersonaCarousel'
import { DIFFICULTY_META, type Difficulty } from '@/lib/sparring-arena'
import {
  LENGTH_OPTIONS,
  MAX_ACTIVE_PRIVATE,
  OBJECTION_STYLES,
  TRAIT_OPTIONS,
  applyEdit,
  canEdit,
  createPrivate,
  emptyDraft,
  fromPersona,
  lengthOf,
  readStore,
  startPlanFor,
  styleOf,
  validateDraft,
  writeStore,
  type Draft,
  type DraftErrors,
  type LibraryPersona,
  type Viewer,
} from '@/lib/persona-library'
import { startSparringSession } from '@/lib/sparring-start'

const STEPS = ['Who are you meeting?', 'What should they challenge?', 'How difficult?', 'Review'] as const
type Step = 1 | 2 | 3 | 4

const field =
  'mt-1 w-full rounded-lg border border-slate-600 bg-[#050a18] px-3 py-2 text-sm text-white placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300'

function Choice({ checked, onClick, children }: { checked: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={clsx(
        'w-full rounded-xl border px-4 py-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300',
        checked ? 'border-cyan-300 bg-cyan-400/15 text-white' : 'border-slate-600 text-slate-100 hover:border-slate-400',
      )}
    >
      {children}
    </button>
  )
}

export default function PersonaWizard() {
  const router = useRouter()
  const [viewer, setViewer] = useState<Viewer | null>(null)
  const [ready, setReady] = useState(false)
  const [step, setStep] = useState<Step>(1)
  const [draft, setDraft] = useState<Draft>(emptyDraft())
  const [errors, setErrors] = useState<DraftErrors>({})
  const [editing, setEditing] = useState<LibraryPersona | null>(null)
  const [blocked, setBlocked] = useState<string | null>(null)
  const [saved, setSaved] = useState<LibraryPersona | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let v: Viewer | null = null
      try {
        const r = await proxyFetch('/v1/reps/me', { cache: 'no-store' })
        const j = await r.json().catch(() => null)
        const m = j?.me ?? j
        if (r.ok && m?.id) v = { id: m.id, tier: m.tier ?? null, companyId: m.company_id ?? null }
      } catch {
        /* handled below */
      }
      if (cancelled) return
      setViewer(v)
      const editId = new URLSearchParams(window.location.search).get('edit')
      if (v && editId) {
        const p = readStore(v.id).find((x) => x.id === editId)
        if (p && canEdit(p, v)) {
          setEditing(p)
          setDraft(fromPersona(p))
        } else setBlocked('That persona cannot be edited. Duplicate it to make your own copy.')
      }
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    headingRef.current?.focus()
  }, [step, saved])

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  // Functional update so rapid toggles never work from a stale list.
  const toggleTrait = (t: string) =>
    setDraft((d) => ({ ...d, traits: d.traits.includes(t) ? d.traits.filter((x) => x !== t) : d.traits.length >= 5 ? d.traits : [...d.traits, t] }))

  function next() {
    const e = validateDraft(draft, step === 4 ? 4 : (step as 1 | 2 | 3))
    setErrors(e)
    if (Object.keys(e).length === 0) setStep((s) => (Math.min(4, s + 1) as Step))
  }

  function create() {
    if (!viewer) return
    const e = validateDraft(draft, 4)
    setErrors(e)
    if (Object.keys(e).length) return
    const all = readStore(viewer.id)
    if (!editing && all.filter((p) => p.status !== 'archived').length >= MAX_ACTIVE_PRIVATE) {
      setError(`You can keep up to ${MAX_ACTIVE_PRIVATE} personas. Archive one to make room.`)
      return
    }
    const persona = editing ? applyEdit(editing, draft, viewer) : createPrivate(draft, viewer, crypto.randomUUID())
    if (!persona) return setError('That persona cannot be edited.')
    const list = editing ? all.map((p) => (p.id === persona.id ? persona : p)) : [persona, ...all]
    if (!writeStore(viewer.id, list)) return setError('Could not save on this device. Check your browser storage settings.')
    setError(null)
    setSaved(persona)
  }

  async function startPractising() {
    if (!saved || busy) return
    setBusy(true)
    setError(null)
    try {
      const plan = startPlanFor(saved)
      const id = await startSparringSession(plan)
      router.push(`/sparring/${encodeURIComponent(id)}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start sparring session.')
      setBusy(false)
    }
  }

  const style = draft.objectionStyle ? styleOf(draft.objectionStyle) : null

  return (
    <PageContainer>
      <div className={clsx(styles.arena, styles.calm)}>
        <div className={styles.floor} aria-hidden="true" />
        <div className="relative mx-auto max-w-2xl px-5 py-8 sm:px-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
            {editing ? 'Edit persona' : 'Create persona'}{' '}
            <span className="ml-1 rounded border border-violet-400/50 px-1.5 py-px text-[10px] tracking-wider text-violet-200">Prototype</span>
          </p>

          {!ready && <p className="py-16 text-center text-sm text-slate-200">Loading…</p>}
          {ready && !viewer && (
            <p role="alert" className="mt-6 rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-100">
              We couldn&apos;t confirm who you are. Sign in again, then retry.
            </p>
          )}
          {ready && blocked && (
            <div className="mt-6 rounded-xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-100">
              {blocked} <Link href="/sparring?tab=mine" className="underline">Back to My Personas</Link>
            </div>
          )}

          {/* ───── finished ───── */}
          {ready && viewer && !blocked && saved && (
            <div>
              <h1 ref={headingRef} tabIndex={-1} className="mt-1 text-2xl font-semibold text-white outline-none">
                {editing ? 'Persona updated' : 'Persona created'}
              </h1>
              <p className="mt-1 text-sm text-slate-200">
                <strong className="text-white">{saved.name}</strong> ({saved.jobRole}) is in My Personas. Only you can see it.
              </p>
              <p className="mt-3 rounded-lg border border-violet-400/40 bg-violet-400/10 px-3 py-2 text-xs text-violet-100">
                Prototype: saved on this device only. Practice runs on the closest standard opponent for now, so the buyer
                behaves like &ldquo;{styleOf(saved.objectionStyle).label}&rdquo;.
              </p>
              {error && <p role="alert" className="mt-3 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p>}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <button type="button" onClick={startPractising} disabled={busy} className={clsx(buttonClasses('primary', 'md'), 'justify-center py-3 sm:px-8')}>
                  {busy ? 'Starting…' : 'Start practising'}
                </button>
                <button type="button" disabled aria-describedby="submit-note" className={clsx(buttonClasses('ghost', 'md'), 'justify-center')}>
                  Submit for team approval
                </button>
                <Link href="/sparring?tab=mine" className={clsx(buttonClasses('ghost', 'md'), 'justify-center')}>
                  Return to library
                </Link>
              </div>
              <p id="submit-note" className="mt-2 text-xs text-slate-300">Team approval isn&apos;t available yet. Your persona stays private.</p>
            </div>
          )}

          {/* ───── steps ───── */}
          {ready && viewer && !blocked && !saved && (
            <div>
              <ol aria-label="Progress" className="mt-3 flex gap-2">
                {STEPS.map((label, i) => (
                  <li
                    key={label}
                    aria-current={step === i + 1 ? 'step' : undefined}
                    className={clsx('h-1.5 flex-1 rounded-full', i + 1 <= step ? 'bg-cyan-300' : 'bg-slate-600')}
                  >
                    <span className="sr-only">Step {i + 1}: {label}</span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-xs text-slate-300">Step {step} of 4</p>
              <h1 ref={headingRef} tabIndex={-1} className="mt-1 text-2xl font-semibold text-white outline-none">
                {STEPS[step - 1]}
              </h1>

              {step === 1 && (
                <div className="mt-5 space-y-4">
                  <div>
                    <label htmlFor="pw-name" className="text-sm font-medium text-white">Name</label>
                    <input id="pw-name" className={field} value={draft.name} maxLength={60} autoComplete="off" placeholder="e.g. Dana, the sceptical CFO"
                      aria-invalid={!!errors.name} aria-describedby={errors.name ? 'pw-name-err' : undefined} onChange={(e) => set('name', e.target.value)} />
                    {errors.name && <p id="pw-name-err" role="alert" className="mt-1 text-xs text-red-200">{errors.name}</p>}
                  </div>
                  <div>
                    <label htmlFor="pw-role" className="text-sm font-medium text-white">Job role</label>
                    <input id="pw-role" className={field} value={draft.jobRole} maxLength={80} autoComplete="off" placeholder="e.g. Head of Procurement"
                      aria-invalid={!!errors.jobRole} aria-describedby={errors.jobRole ? 'pw-role-err' : undefined} onChange={(e) => set('jobRole', e.target.value)} />
                    {errors.jobRole && <p id="pw-role-err" role="alert" className="mt-1 text-xs text-red-200">{errors.jobRole}</p>}
                  </div>
                  <div>
                    <label htmlFor="pw-industry" className="text-sm font-medium text-white">Industry <span className="font-normal text-slate-300">(optional)</span></label>
                    <input id="pw-industry" className={field} value={draft.industry} maxLength={80} autoComplete="off" placeholder="e.g. Logistics"
                      onChange={(e) => set('industry', e.target.value)} />
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="mt-5 space-y-6">
                  <div>
                    <p id="pw-style" className="text-sm font-medium text-white">How will they challenge you?</p>
                    <div role="radiogroup" aria-labelledby="pw-style" aria-describedby={errors.objectionStyle ? 'pw-style-err' : undefined} className="mt-2 space-y-2">
                      {OBJECTION_STYLES.map((s) => (
                        <Choice key={s.id} checked={draft.objectionStyle === s.id} onClick={() => set('objectionStyle', s.id)}>
                          <span className="block font-medium">{s.label}</span>
                          <span className="block text-xs text-slate-300">{s.hint}</span>
                        </Choice>
                      ))}
                    </div>
                    {errors.objectionStyle && <p id="pw-style-err" role="alert" className="mt-1 text-xs text-red-200">{errors.objectionStyle}</p>}
                  </div>
                  <div>
                    <p id="pw-traits" className="text-sm font-medium text-white">Personality <span className="font-normal text-slate-300">(up to five)</span></p>
                    <div role="group" aria-labelledby="pw-traits" className="mt-2 flex flex-wrap gap-2">
                      {TRAIT_OPTIONS.map((t) => {
                        const on = draft.traits.includes(t)
                        return (
                          <button key={t} type="button" aria-pressed={on} disabled={!on && draft.traits.length >= 5}
                            onClick={() => toggleTrait(t)}
                            className={clsx('rounded-full border px-3 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:opacity-50',
                              on ? 'border-cyan-300 bg-cyan-400/15 text-white' : 'border-slate-600 text-slate-100 hover:border-slate-400')}>
                            {t}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div>
                    <label htmlFor="pw-context" className="text-sm font-medium text-white">Context <span className="font-normal text-slate-300">(optional)</span></label>
                    <textarea id="pw-context" className={clsx(field, 'min-h-[5.5rem]')} value={draft.context} maxLength={400}
                      placeholder="What do they care about right now? What happened on the last call?"
                      aria-describedby="pw-context-count" onChange={(e) => set('context', e.target.value)} />
                    <p id="pw-context-count" className="mt-1 text-right text-[11px] text-slate-300">{draft.context.length}/400</p>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div className="mt-5 space-y-6">
                  <div>
                    <p id="pw-diff" className="text-sm font-medium text-white">Difficulty</p>
                    <div role="radiogroup" aria-labelledby="pw-diff" className="mt-2 grid grid-cols-2 gap-2">
                      {(Object.keys(DIFFICULTY_META) as Difficulty[]).map((d) => (
                        <Choice key={d} checked={draft.difficulty === d} onClick={() => set('difficulty', d)}>
                          <span className="block font-medium">{DIFFICULTY_META[d].label}</span>
                          <span className="mt-1 block"><DifficultyPips difficulty={d} /></span>
                        </Choice>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p id="pw-len" className="text-sm font-medium text-white">Session length</p>
                    <div role="radiogroup" aria-labelledby="pw-len" className="mt-2 space-y-2">
                      {LENGTH_OPTIONS.map((l) => (
                        <Choice key={l.id} checked={draft.lengthPref === l.id} onClick={() => set('lengthPref', l.id)}>
                          <span className="font-medium">{l.label}</span>{' '}
                          <span className="ml-1 text-xs text-slate-300">about {l.minutes[0]}–{l.minutes[1]} min · {l.hint}</span>
                        </Choice>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="mt-5">
                  <dl className="grid gap-x-6 gap-y-3 rounded-xl border border-cyan-400/25 bg-[#070d1f] p-5 sm:grid-cols-2">
                    <div><dt className="text-[11px] uppercase tracking-wider text-slate-300">Name</dt><dd className="text-sm text-white">{draft.name}</dd></div>
                    <div><dt className="text-[11px] uppercase tracking-wider text-slate-300">Role</dt><dd className="text-sm text-white">{draft.jobRole}{draft.industry ? ` · ${draft.industry}` : ''}</dd></div>
                    <div><dt className="text-[11px] uppercase tracking-wider text-slate-300">Challenges you by</dt><dd className="text-sm text-white">{style?.label}</dd></div>
                    <div><dt className="text-[11px] uppercase tracking-wider text-slate-300">Personality</dt><dd className="text-sm text-white">{draft.traits.join(', ') || '—'}</dd></div>
                    <div><dt className="text-[11px] uppercase tracking-wider text-slate-300">Difficulty</dt><dd className="text-sm text-white"><DifficultyPips difficulty={draft.difficulty} /></dd></div>
                    <div><dt className="text-[11px] uppercase tracking-wider text-slate-300">Length</dt><dd className="text-sm text-white">{lengthOf(draft.lengthPref).label}, about {lengthOf(draft.lengthPref).minutes[0]}–{lengthOf(draft.lengthPref).minutes[1]} min</dd></div>
                    {draft.context && <div className="sm:col-span-2"><dt className="text-[11px] uppercase tracking-wider text-slate-300">Context</dt><dd className="text-sm text-white">{draft.context}</dd></div>}
                  </dl>
                  <p className="mt-3 rounded-lg border border-violet-400/40 bg-violet-400/10 px-3 py-2 text-xs text-violet-100">
                    Prototype: saved on this device only, private to you.
                  </p>
                  {error && <p role="alert" className="mt-3 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</p>}
                </div>
              )}

              <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
                {step === 1 ? (
                  <Link href="/sparring?tab=mine" className={buttonClasses('ghost', 'md')}>Cancel</Link>
                ) : (
                  <button type="button" onClick={() => { setError(null); setStep((s) => (s - 1) as Step) }} className={buttonClasses('ghost', 'md')}>Back</button>
                )}
                {step < 4 ? (
                  <button type="button" onClick={next} className={buttonClasses('primary', 'md')}>Next</button>
                ) : (
                  <button type="button" onClick={create} className={buttonClasses('primary', 'md')}>{editing ? 'Save changes' : 'Create persona'}</button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </PageContainer>
  )
}
