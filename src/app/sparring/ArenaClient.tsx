'use client'

// Sparring Arena (staging prototype). Backend, API contracts and the live session page are unchanged: this only calls
// existing endpoints and starts a session through the same start path as SparringStartButton.
// See docs/sparring-arena/AUDIT.md and PRIVATE_PERSONAS_API.md.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { clsx } from 'clsx'
import { proxyFetch } from '@/lib/api'
import { PageContainer } from '@/components/layout/page-container'
import { buttonClasses } from '@/components/ui/button'
import styles from '@/components/arena/arena.module.css'
import { PersonaCarousel, DifficultyPips, type CarouselLayout } from '@/components/arena/PersonaCarousel'
import { MissionBriefing } from '@/components/arena/MissionBriefing'
import {
  DEMO_STATS,
  isManagerTier,
  normaliseDifficulty,
  personalBest,
  presentationFor,
  summariseLeaderboard,
  teamRecord,
  type ApiLeaderboard,
  type ApiPersona,
  type ApiSession,
  type ArenaMode,
  type Difficulty,
  type PersonaPresentation,
} from '@/lib/sparring-arena'
import {
  MAX_ACTIVE_PRIVATE,
  STATUS_LABEL,
  canArchive,
  canEdit,
  duplicate,
  lengthOf,
  myPersonas,
  readStore,
  startPlanFor,
  styleOf,
  toApiPersona,
  transition,
  writeStore,
  type LibraryPersona,
  type Viewer,
} from '@/lib/persona-library'
import { startSparringSession } from '@/lib/sparring-start'

type TabId = 'all' | 'mine' | 'assigned' | 'team' | 'recent'
type Assignment = { id: string; title?: string | null; type?: string | null; status?: string | null; target_id?: string | null }

const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All Personas' },
  { id: 'mine', label: 'My Personas' },
  { id: 'assigned', label: 'Assigned to Me' },
  { id: 'team', label: 'Team Challenges' },
  { id: 'recent', label: 'Recent Sessions' },
]

/** '3d' on wide screens with a capable device; 'strip' (plain horizontal cards) otherwise. `?lite=1` forces it. */
function useLayout(): CarouselLayout {
  const [layout, setLayout] = useState<CarouselLayout>('strip')
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } }
    const weak = (nav.hardwareConcurrency ?? 8) <= 2 || (nav.deviceMemory ?? 8) <= 2 || !!nav.connection?.saveData
    const forced = new URLSearchParams(window.location.search).get('lite') === '1'
    const apply = () => setLayout(mq.matches && !weak && !forced ? '3d' : 'strip')
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  return layout
}

async function getJson(path: string) {
  try {
    const r = await proxyFetch(path, { cache: 'no-store' })
    const j = await r.json().catch(() => null)
    return r.ok && j && j.ok !== false ? j : null
  } catch {
    return null
  }
}

const Fact = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <dt className="text-[11px] uppercase tracking-wider text-slate-300">{label}</dt>
    <dd className="mt-0.5 text-sm text-slate-50">{children}</dd>
  </div>
)

type BriefingState = {
  persona: ApiPersona
  /** Built-in engine id actually sent to the API. */
  engineId: string
  assignmentId?: string | null
  presentation?: PersonaPresentation
  initialMode?: ArenaMode
  initialDifficulty?: Difficulty
}

export default function ArenaClient() {
  const router = useRouter()
  const layout = useLayout()
  const [tab, setTab] = useState<TabId>('all')
  const [personas, setPersonas] = useState<ApiPersona[]>([])
  const [sessions, setSessions] = useState<ApiSession[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [me, setMe] = useState<{ id: string | null; tier: string | null; companyId: string | null }>({ id: null, tier: null, companyId: null })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [boards, setBoards] = useState<Record<string, ApiLeaderboard | null>>({})
  const [active, setActive] = useState(0)
  const [briefing, setBriefing] = useState<BriefingState | null>(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [demo, setDemo] = useState(false)
  const [mine, setMine] = useState<LibraryPersona[]>([])
  const [showArchived, setShowArchived] = useState(false)
  const opener = useRef<HTMLElement | null>(null)

  const isManager = isManagerTier(me.tier)
  const viewer: Viewer | null = me.id ? { id: me.id, tier: me.tier, companyId: me.companyId } : null

  // deep link: /sparring?tab=mine (used by the persona wizard's "Return to library")
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab')
    if (t === 'mine' || t === 'assigned' || t === 'team' || t === 'recent') setTab(t)
  }, [])

  // ── load (all existing endpoints, read only) ──
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [p, meJson, s, a] = await Promise.all([
        getJson('/v1/sparring/personas'),
        getJson('/v1/reps/me'),
        getJson('/v1/sparring/sessions?limit=50'),
        getJson('/v1/assignments'),
      ])
      if (cancelled) return
      if (!p || !Array.isArray(p.personas)) setLoadError('Opponents could not be loaded. Try again in a moment.')
      else setPersonas(p.personas)
      // /v1/reps/me answers { ok, me } or the same fields at top level (the API has two handlers on that path)
      const m = meJson?.me ?? meJson
      setMe({ id: m?.id ?? null, tier: m?.tier ?? null, companyId: m?.company_id ?? null })
      setSessions(Array.isArray(s?.sessions) ? s.sessions : [])
      const items: Assignment[] = a?.assignments ?? a?.items ?? []
      setAssignments(items.filter((x) => x.type === 'sparring' && x.status !== 'completed'))
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (me.id) setMine(readStore(me.id))
  }, [me.id])

  const selected = personas[active] ?? null

  const loadBoard = useCallback(
    async (id: string) => {
      if (id in boards) return
      setBoards((b) => ({ ...b, [id]: null }))
      const j = await getJson(`/v1/sparring/leaderboard/${encodeURIComponent(id)}`)
      setBoards((b) => ({ ...b, [id]: j }))
    },
    [boards],
  )
  useEffect(() => {
    if (tab !== 'team') return
    personas.forEach((p) => void loadBoard(p.id))
  }, [tab, personas, loadBoard])

  // ── challenge → briefing → existing start flow ──
  function openBriefing(next: BriefingState) {
    opener.current = document.activeElement as HTMLElement | null
    setStartError(null)
    setBriefing(next)
  }
  const closeBriefing = useCallback(() => {
    setBriefing(null)
    window.setTimeout(() => opener.current?.focus(), 0)
  }, [])

  async function begin(opts: { mode: ArenaMode; difficulty: Difficulty }) {
    if (!briefing || starting) return
    setStarting(true)
    setStartError(null)
    try {
      const id = await startSparringSession({
        personaId: briefing.engineId,
        difficulty: opts.difficulty,
        mode: opts.mode,
        assignmentId: briefing.assignmentId,
      })
      router.push(`/sparring/${encodeURIComponent(id)}`) // live session page: calm, no arena effects
    } catch (e: unknown) {
      setStartError(e instanceof Error ? e.message : 'Failed to start sparring session.')
      setStarting(false)
    }
  }

  // ── "My Personas" actions (prototype store, this browser only) ──
  function saveMine(next: LibraryPersona[]) {
    if (!me.id) return
    writeStore(me.id, next)
    setMine(next)
  }
  function onDuplicate(p: LibraryPersona) {
    if (!viewer) return
    if (mine.filter((x) => x.status !== 'archived').length >= MAX_ACTIVE_PRIVATE) return
    const copy = duplicate(p, viewer, crypto.randomUUID())
    if (copy) saveMine([copy, ...mine])
  }
  function onArchive(p: LibraryPersona, action: 'archive' | 'restore') {
    if (!viewer) return
    const r = transition(p, action, viewer)
    if (r.ok) saveMine(mine.map((x) => (x.id === p.id ? r.persona : x)))
  }
  function practise(p: LibraryPersona) {
    const plan = startPlanFor(p)
    openBriefing({
      persona: toApiPersona(p),
      engineId: plan.personaId,
      initialDifficulty: plan.difficulty,
      initialMode: plan.mode,
      presentation: {
        role: p.jobRole,
        context: [p.industry, p.context].filter(Boolean).join(' · ') || 'Your own scenario',
        objectionStyle: styleOf(p.objectionStyle).label,
        estMinutes: lengthOf(p.lengthPref).minutes,
        objective: styleOf(p.objectionStyle).objective,
      },
    })
  }

  // ── derived stats for the selected persona ──
  const record = useMemo(() => (selected ? teamRecord(sessions, selected.id, isManager) : null), [sessions, selected, isManager])
  const best = useMemo(() => (selected ? personalBest(sessions, me.id, selected.id) : null), [sessions, selected, me.id])
  const personaById = useMemo(() => new Map(personas.map((p) => [p.id, p])), [personas])
  const myList = viewer ? myPersonas(mine, viewer, showArchived) : []
  const labelId = 'arena-title'

  return (
    <PageContainer>
      <div className={clsx(styles.arena, (briefing || starting) && styles.calm)}>
        <div className={styles.floor} aria-hidden="true" />

        <header className="relative px-5 pb-2 pt-6 sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-200">
                Sparring Arena <span className="ml-1 rounded border border-violet-400/50 px-1.5 py-px text-[10px] tracking-wider text-violet-200">Prototype</span>
              </p>
              <h1 id={labelId} className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Choose your opponent
              </h1>
              <p className="mt-1 max-w-xl text-sm text-slate-200">Pick a buyer, read the briefing, then step in.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={demo}
                onClick={() => setDemo((d) => !d)}
                className={clsx(buttonClasses('ghost', 'md'), demo && 'border-amber-400/70 text-amber-200')}
              >
                {demo ? 'Hide demo data' : 'Preview with demo data'}
              </button>
              <Link href="/sparring/personas/new" className={buttonClasses('ghost', 'md')}>
                Create Persona
              </Link>
              {isManager && (
                <Link href="/admin/personas" className={buttonClasses('ghost', 'md')}>
                  Persona Setup
                </Link>
              )}
            </div>
          </div>

          {demo && (
            <p role="status" className="mt-3 rounded-lg border border-amber-400/60 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
              <strong>DEMO DATA.</strong> The figures shown are samples for design review, not real results.
            </p>
          )}

          <div role="tablist" aria-label="Arena sections" className="mt-5 flex gap-1 overflow-x-auto border-b border-cyan-400/20">
            {TABS.map((t, i) => (
              <button
                key={t.id}
                role="tab"
                id={`arena-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`arena-panel-${t.id}`}
                tabIndex={tab === t.id ? 0 : -1}
                onClick={() => setTab(t.id)}
                onKeyDown={(e) => {
                  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
                  e.preventDefault()
                  const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]
                  setTab(next.id)
                  document.getElementById(`arena-tab-${next.id}`)?.focus()
                }}
                className={clsx(
                  '-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300',
                  tab === t.id ? 'border-cyan-300 text-white' : 'border-transparent text-slate-300 hover:text-white',
                )}
              >
                {t.label}
                {t.id === 'assigned' && assignments.length > 0 && (
                  <span className="ml-1.5 rounded-full bg-cyan-400/20 px-1.5 py-0.5 text-[10px] tabular-nums text-cyan-100">{assignments.length}</span>
                )}
              </button>
            ))}
          </div>
        </header>

        <div className="relative px-3 pb-8 pt-4 sm:px-8">
          {loading && <p className="py-16 text-center text-sm text-slate-200">Loading opponents…</p>}
          {!loading && loadError && (
            <p role="alert" className="mx-auto my-12 max-w-md rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-center text-sm text-red-100">
              {loadError}{' '}
              <button type="button" className="underline" onClick={() => window.location.reload()}>Try again</button>
            </p>
          )}

          {/* ───── All Personas ───── */}
          {!loading && !loadError && tab === 'all' && (
            <div role="tabpanel" id="arena-panel-all" aria-labelledby="arena-tab-all">
              <PersonaCarousel
                personas={personas}
                active={active}
                onActiveChange={setActive}
                onChallenge={() => selected && openBriefing({ persona: selected, engineId: selected.id })}
                layout={layout}
                labelId={labelId}
              />

              {selected && record && best && (
                <section aria-label={`${selected.label} briefing`} className="mx-auto mt-5 max-w-3xl rounded-2xl border border-cyan-400/25 bg-[#070d1f] p-5">
                  {/* 1. who the opponent is */}
                  <h2 className="text-lg font-semibold text-white">{selected.label}</h2>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-200">{selected.description}</p>

                  {/* 2. what makes them challenging */}
                  {(() => {
                    const p = presentationFor(selected)
                    return (
                      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
                        <Fact label="Role">{p.role}</Fact>
                        <Fact label="Difficulty"><DifficultyPips difficulty={selected.difficulty_default} /></Fact>
                        <Fact label="Objection style">{p.objectionStyle}</Fact>
                        <Fact label="Est. length">{p.estMinutes[0]}–{p.estMinutes[1]} min</Fact>
                      </dl>
                    )
                  })()}

                  {/* 3. the record or objective */}
                  <div className="mt-4 rounded-xl border border-cyan-400/20 bg-[#050a18] px-4 py-3">
                    {demo ? (
                      <>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-200">Demo data</p>
                        <p className="mt-0.5 text-sm text-slate-50">Team record {DEMO_STATS.teamRecordXp.toLocaleString()} XP. Can you beat it?</p>
                        <p className="text-xs text-slate-300">
                          {DEMO_STATS.repsAttempted} reps attempted · {DEMO_STATS.repsDefeated} defeated · your best {DEMO_STATS.yourBestXp.toLocaleString()} XP
                        </p>
                      </>
                    ) : isManager && record.value !== null ? (
                      <>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Team record</p>
                        <p className="mt-0.5 text-sm text-slate-50"><strong className="text-xl text-white">{record.value}</strong>/100. Can you beat it?</p>
                      </>
                    ) : best.best !== null ? (
                      <>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Your best</p>
                        <p className="mt-0.5 text-sm text-slate-50">
                          <strong className="text-xl text-white">{best.best}</strong>/100
                          <span className="ml-2 text-xs text-slate-300">{best.attempts} run{best.attempts === 1 ? '' : 's'}</span>
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Your record</p>
                        <p className="mt-0.5 text-sm text-slate-100">No result yet. Your first run sets the bar.</p>
                      </>
                    )}
                  </div>

                  {/* 4. start the challenge */}
                  <button
                    type="button"
                    onClick={() => openBriefing({ persona: selected, engineId: selected.id })}
                    className={clsx(buttonClasses('primary', 'md'), 'mt-4 w-full justify-center py-3 text-base sm:w-auto sm:px-10')}
                  >
                    Challenge Persona
                  </button>

                  <details className="mt-3 text-sm text-slate-100">
                    <summary className="cursor-pointer text-cyan-100 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300">
                      View full briefing
                    </summary>
                    {(() => {
                      const p = presentationFor(selected)
                      return (
                        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                          <Fact label="Context">{p.context}</Fact>
                          <Fact label="Traits">{selected.traits?.join(', ') || '—'}</Fact>
                          <Fact label="Objective">{p.objective}</Fact>
                          <Fact label="To defeat them">Finish with 80/100 or higher.</Fact>
                        </dl>
                      )
                    })()}
                  </details>
                </section>
              )}
            </div>
          )}

          {/* ───── My Personas ───── */}
          {!loading && !loadError && tab === 'mine' && (
            <div role="tabpanel" id="arena-panel-mine" aria-labelledby="arena-tab-mine" className="mx-auto max-w-4xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-white">My Personas</h2>
                  <p className="text-sm text-slate-200">Your own practice scenarios. Only you can see and use them.</p>
                </div>
                <Link href="/sparring/personas/new" className={buttonClasses('primary', 'md')}>Create Persona</Link>
              </div>
              <p className="mt-3 rounded-lg border border-violet-400/40 bg-violet-400/10 px-3 py-2 text-xs text-violet-100">
                Prototype: personas are saved on this device only. Sharing with your team needs the persona service.
              </p>

              {myList.length === 0 ? (
                <div className="mt-6 rounded-xl border border-cyan-400/20 bg-[#070d1f] p-8 text-center">
                  <p className="text-sm text-slate-100">You haven&apos;t created a persona yet.</p>
                  <p className="mt-1 text-xs text-slate-300">Describe the buyer you are about to meet and practise the call first.</p>
                  <Link href="/sparring/personas/new" className={clsx(buttonClasses('primary', 'md'), 'mt-4')}>Create your first persona</Link>
                </div>
              ) : (
                <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                  {myList.map((p) => (
                    <li key={p.id} className="flex flex-col rounded-xl border border-cyan-400/25 bg-[#070d1f] p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate text-base font-semibold text-white">{p.name}</h3>
                          <p className="truncate text-xs text-slate-200">{[p.jobRole, p.industry].filter(Boolean).join(' · ')}</p>
                        </div>
                        <span className="shrink-0 rounded-full border border-cyan-400/40 px-2 py-0.5 text-[11px] text-cyan-100">{STATUS_LABEL[p.status]}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-200">
                        <DifficultyPips difficulty={p.difficulty} />
                        <span>{styleOf(p.objectionStyle).label}</span>
                        <span>~{lengthOf(p.lengthPref).minutes[0]}–{lengthOf(p.lengthPref).minutes[1]} min</span>
                      </div>
                      {p.reviewOutcome === 'rejected' && <p className="mt-2 text-xs text-amber-200">A manager asked for changes. It is still yours and still private.</p>}
                      <div className="mt-4 flex flex-wrap gap-2">
                        {p.status !== 'archived' && (
                          <button type="button" className={buttonClasses('primary', 'sm')} onClick={() => practise(p)}>Practise</button>
                        )}
                        {viewer && canEdit(p, viewer) && (
                          <Link href={`/sparring/personas/new?edit=${encodeURIComponent(p.id)}`} className={buttonClasses('ghost', 'sm')}>Edit</Link>
                        )}
                        {p.status !== 'archived' && (
                          <button type="button" className={buttonClasses('ghost', 'sm')} onClick={() => onDuplicate(p)}>Duplicate</button>
                        )}
                        {viewer && canArchive(p, viewer) && (
                          <button type="button" className={buttonClasses('ghost', 'sm')} onClick={() => onArchive(p, 'archive')}>Archive</button>
                        )}
                        {p.status === 'archived' && (
                          <button type="button" className={buttonClasses('ghost', 'sm')} onClick={() => onArchive(p, 'restore')}>Restore</button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {mine.some((p) => p.status === 'archived') && (
                <button type="button" aria-pressed={showArchived} onClick={() => setShowArchived((v) => !v)} className="mt-4 text-xs text-cyan-100 underline">
                  {showArchived ? 'Hide archived' : 'Show archived'}
                </button>
              )}
            </div>
          )}

          {/* ───── Assigned to Me ───── */}
          {!loading && !loadError && tab === 'assigned' && (
            <div role="tabpanel" id="arena-panel-assigned" aria-labelledby="arena-tab-assigned" className="mx-auto max-w-3xl">
              {assignments.length === 0 ? (
                <p className="rounded-xl border border-cyan-400/20 bg-[#070d1f] p-6 text-center text-sm text-slate-200">
                  No sparring drills are assigned to you right now.
                </p>
              ) : (
                <ul className="space-y-2">
                  {assignments.map((a) => {
                    const persona = a.target_id ? personaById.get(a.target_id) : undefined
                    return (
                      <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-400/25 bg-[#070d1f] p-4">
                        <div>
                          <div className="text-sm font-semibold text-white">{a.title || 'Sparring drill'}</div>
                          <div className="text-xs text-slate-200">{persona ? persona.label : 'No persona set on this assignment'}</div>
                        </div>
                        <button
                          type="button"
                          disabled={!persona}
                          onClick={() => persona && openBriefing({ persona, engineId: persona.id, assignmentId: a.id })}
                          className={buttonClasses('ghost', 'md')}
                        >
                          Open briefing
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          {/* ───── Team Challenges ───── */}
          {!loading && !loadError && tab === 'team' && (
            <div role="tabpanel" id="arena-panel-team" aria-labelledby="arena-tab-team" className="mx-auto max-w-4xl">
              <p className="mb-3 text-sm text-slate-200">{isManager ? 'Results per persona across your team.' : 'Your results per persona.'}</p>
              <div className="overflow-x-auto rounded-xl border border-cyan-400/25 bg-[#070d1f]">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Persona results</caption>
                  <thead>
                    <tr className="border-b border-cyan-400/20 text-[11px] uppercase tracking-wider text-slate-300">
                      <th scope="col" className="px-4 py-3">Persona</th>
                      <th scope="col" className="px-4 py-3 text-right">Attempts</th>
                      <th scope="col" className="px-4 py-3 text-right">Scored 80+</th>
                      <th scope="col" className="px-4 py-3 text-right">Best score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {personas.map((p) => {
                      const b = summariseLeaderboard(boards[p.id] ?? null, isManager)
                      const top = isManager ? teamRecord(sessions, p.id, true).value : personalBest(sessions, me.id, p.id).best
                      return (
                        <tr key={p.id} className="border-b border-slate-800 last:border-0">
                          <th scope="row" className="px-4 py-3 font-medium text-white">{p.label}</th>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-50">{b.attempts.value ?? '—'}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-50">{b.defeated.value ?? '—'}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-50">{top ?? '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ───── Recent Sessions ───── */}
          {!loading && !loadError && tab === 'recent' && (
            <div role="tabpanel" id="arena-panel-recent" aria-labelledby="arena-tab-recent" className="mx-auto max-w-3xl">
              {sessions.length === 0 ? (
                <p className="rounded-xl border border-cyan-400/20 bg-[#070d1f] p-6 text-center text-sm text-slate-200">
                  No sparring sessions yet. Challenge a persona to start.
                </p>
              ) : (
                <ul className="space-y-2">
                  {sessions.slice(0, 12).map((s) => (
                    <li key={s.id}>
                      <Link
                        href={`/sparring/${encodeURIComponent(s.id)}`}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cyan-400/25 bg-[#070d1f] p-4 hover:border-cyan-300/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                      >
                        <div>
                          <div className="text-sm font-semibold text-white">{personaById.get(s.persona_id ?? '')?.label ?? s.persona_id ?? 'Session'}</div>
                          <div className="text-xs text-slate-200">
                            {DifficultyLabel(s.difficulty)} · {s.created_at ? new Date(s.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                          </div>
                        </div>
                        <div className="text-sm tabular-nums text-slate-50">{typeof s.total === 'number' ? `${s.total}/100` : 'Not scored'}</div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {briefing && (
        <MissionBriefing
          persona={briefing.persona}
          initialDifficulty={briefing.initialDifficulty ?? normaliseDifficulty(briefing.persona.difficulty_default)}
          initialMode={briefing.initialMode}
          presentation={briefing.presentation}
          assignmentId={briefing.assignmentId}
          busy={starting}
          error={startError}
          onCancel={closeBriefing}
          onBegin={begin}
        />
      )}
    </PageContainer>
  )
}

function DifficultyLabel(raw?: string | null) {
  const d = normaliseDifficulty(raw)
  return d.charAt(0).toUpperCase() + d.slice(1)
}
