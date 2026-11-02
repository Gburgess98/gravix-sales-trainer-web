'use client'

// Sparring Arena (staging prototype). Replaces the redirect stub at /sparring with an opponent-selection screen.
// Backend, API contracts and the live session page (/sparring/[id]) are unchanged: this only calls existing
// endpoints and starts a session with the same body as SparringStartButton. See docs/sparring-arena/AUDIT.md.

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
import { ProvenanceChip } from '@/components/arena/ProvenanceChip'
import {
  DEMO_STATS,
  buildStartBody,
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
} from '@/lib/sparring-arena'

type TabId = 'all' | 'assigned' | 'team' | 'recent'
type Assignment = { id: string; title?: string | null; type?: string | null; status?: string | null; target_id?: string | null }

const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All Personas' },
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

export default function ArenaClient() {
  const router = useRouter()
  const layout = useLayout()
  const [tab, setTab] = useState<TabId>('all')
  const [personas, setPersonas] = useState<ApiPersona[]>([])
  const [sessions, setSessions] = useState<ApiSession[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [me, setMe] = useState<{ id: string | null; tier: string | null }>({ id: null, tier: null })
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [boards, setBoards] = useState<Record<string, ApiLeaderboard | null>>({})
  const [active, setActive] = useState(0)
  const [briefing, setBriefing] = useState<{ persona: ApiPersona; assignmentId?: string | null } | null>(null)
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [demo, setDemo] = useState(false)
  const opener = useRef<HTMLElement | null>(null)

  const isManager = isManagerTier(me.tier)

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
      setMe({ id: m?.id ?? null, tier: m?.tier ?? null })
      setSessions(Array.isArray(s?.sessions) ? s.sessions : [])
      const items: Assignment[] = a?.assignments ?? a?.items ?? []
      setAssignments(items.filter((x) => x.type === 'sparring' && x.status !== 'completed'))
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const selected = personas[active] ?? null

  // leaderboard for one persona, fetched lazily and cached
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
    if (selected && tab === 'all') void loadBoard(selected.id)
  }, [selected, tab, loadBoard])
  useEffect(() => {
    if (tab !== 'team') return
    personas.forEach((p) => void loadBoard(p.id))
  }, [tab, personas, loadBoard])

  // ── challenge → briefing → existing start flow ──
  function openBriefing(persona: ApiPersona, assignmentId?: string | null) {
    opener.current = document.activeElement as HTMLElement | null
    setStartError(null)
    setBriefing({ persona, assignmentId })
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
      const res = await proxyFetch('/api/proxy/v1/sparring/sessions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          buildStartBody({
            personaId: briefing.persona.id,
            difficulty: opts.difficulty,
            mode: opts.mode,
            assignmentId: briefing.assignmentId,
          }),
        ),
        cache: 'no-store',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json || json.ok === false || !json.session?.id) {
        throw new Error(json?.error || 'Failed to start sparring session.')
      }
      router.push(`/sparring/${encodeURIComponent(json.session.id)}`) // live session page: calm, no arena effects
    } catch (e: unknown) {
      setStartError(e instanceof Error ? e.message : 'Failed to start sparring session.')
      setStarting(false)
    }
  }

  // ── derived stats for the selected persona ──
  const record = useMemo(() => (selected ? teamRecord(sessions, selected.id, isManager) : null), [sessions, selected, isManager])
  const mine = useMemo(() => (selected ? personalBest(sessions, me.id, selected.id) : null), [sessions, selected, me.id])
  const board = selected ? summariseLeaderboard(boards[selected.id] ?? null, isManager) : null
  const boardPending = selected ? !(selected.id in boards) || boards[selected.id] === null : false

  const personaById = useMemo(() => new Map(personas.map((p) => [p.id, p])), [personas])
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
              <p className="mt-1 max-w-xl text-sm text-slate-200">
                Pick a buyer, read the briefing, then step in. Nothing starts until you press Begin.
              </p>
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
              {isManager && (
                <Link href="/admin/personas" className={buttonClasses('ghost', 'md')}>
                  Persona Setup
                </Link>
              )}
            </div>
          </div>

          {demo && (
            <p role="status" className="mt-3 rounded-lg border border-amber-400/60 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
              <strong>DEMO DATA.</strong> The numbers marked DEMO are sample values for design review. They are not real results and are not saved.
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
                onChallenge={() => selected && openBriefing(selected)}
                layout={layout}
                labelId={labelId}
              />

              {selected && record && mine && board && (
                <section aria-label={`${selected.label} details`} className="mx-auto mt-6 grid max-w-4xl gap-4 rounded-2xl border border-cyan-400/25 bg-[#070d1f] p-5 md:grid-cols-2">
                  <div>
                    <h2 className="text-lg font-semibold text-white">{selected.label}</h2>
                    <p className="mt-0.5 text-sm text-slate-200">{selected.description}</p>
                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                      {(() => {
                        const p = presentationFor(selected)
                        return (
                          <>
                            <div><dt className="text-[11px] uppercase tracking-wider text-slate-300">Role</dt><dd className="text-slate-50">{p.role}</dd></div>
                            <div><dt className="text-[11px] uppercase tracking-wider text-slate-300">Context</dt><dd className="text-slate-50">{p.context}</dd></div>
                            <div><dt className="text-[11px] uppercase tracking-wider text-slate-300">Objection style</dt><dd className="text-slate-50">{p.objectionStyle}</dd></div>
                            <div><dt className="text-[11px] uppercase tracking-wider text-slate-300">Est. length</dt><dd className="text-slate-50">{p.estMinutes[0]}–{p.estMinutes[1]} min</dd></div>
                            <div><dt className="text-[11px] uppercase tracking-wider text-slate-300">Difficulty</dt><dd><DifficultyPips difficulty={selected.difficulty_default} /></dd></div>
                            <div><dt className="text-[11px] uppercase tracking-wider text-slate-300">Traits</dt><dd className="text-slate-50">{selected.traits?.join(', ') || '—'}</dd></div>
                          </>
                        )
                      })()}
                    </dl>
                    <p className="mt-3 text-[11px] text-slate-300">
                      Role, context, objection style and length are <ProvenanceChip kind="placeholder" /> copy until the API provides them.
                    </p>
                  </div>

                  <div className="flex flex-col">
                    <h3 className="text-sm font-semibold text-white">The challenge</h3>
                    {demo ? (
                      <ul className="mt-2 space-y-1.5 text-sm text-slate-50">
                        <li>Team record: {DEMO_STATS.teamRecordXp.toLocaleString()} XP. Can you beat it? <ProvenanceChip kind="demo" /></li>
                        <li>{DEMO_STATS.repsAttempted} reps attempted · {DEMO_STATS.repsDefeated} defeated this persona <ProvenanceChip kind="demo" /></li>
                        <li>Your best: {DEMO_STATS.yourBestXp.toLocaleString()} XP <ProvenanceChip kind="demo" /></li>
                      </ul>
                    ) : (
                      <ul className="mt-2 space-y-2 text-sm text-slate-50">
                        <li className="flex flex-wrap items-center gap-2">
                          <span>
                            Team record:{' '}
                            {record.value !== null ? <strong>{record.value}/100</strong> : <span className="text-slate-300">{record.provenance === 'unavailable' ? 'not available for your role' : 'no scored sessions yet'}</span>}
                          </span>
                          <ProvenanceChip kind={record.provenance} />
                        </li>
                        <li className="flex flex-wrap items-center gap-2">
                          <span>
                            {boardPending
                              ? 'Loading attempts…'
                              : board.attempts.value === null
                                ? 'Attempts: not available'
                                : `${board.attempts.value} attempt${board.attempts.value === 1 ? '' : 's'} ${board.scope === 'team' ? 'by your team' : 'by you'} · ${board.defeated.value ?? 0} scored 80+`}
                          </span>
                          {!boardPending && <ProvenanceChip kind={board.attempts.provenance} />}
                        </li>
                        <li className="flex flex-wrap items-center gap-2">
                          <span>
                            Your best:{' '}
                            {mine.best !== null ? <strong>{mine.best}/100</strong> : <span className="text-slate-300">{mine.attempts > 0 ? 'no scored attempts yet' : 'no attempts yet'}</span>}
                            {mine.attempts > 0 && <span className="text-slate-300"> ({mine.attempts} attempt{mine.attempts === 1 ? '' : 's'})</span>}
                          </span>
                          <ProvenanceChip kind="derived" />
                        </li>
                      </ul>
                    )}
                    {!demo && !isManager && (
                      <p className="mt-2 text-[11px] text-slate-300">
                        Team records and attempts by other reps are only visible to managers today, so nothing is estimated here.
                      </p>
                    )}
                    <div className="mt-auto pt-5">
                      <button
                        type="button"
                        onClick={() => openBriefing(selected)}
                        className={clsx(buttonClasses('primary', 'md'), 'w-full sm:w-auto')}
                      >
                        Challenge Persona
                      </button>
                    </div>
                  </div>
                </section>
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
                          onClick={() => persona && openBriefing(persona, a.id)}
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
              <p className="mb-3 text-sm text-slate-200">
                {isManager
                  ? 'Results per persona across your team. These are real session totals.'
                  : 'You see your own results per persona. Team-wide results are visible to managers today.'}{' '}
                Challenge targets and deadlines do not exist yet <ProvenanceChip kind="unavailable" />
              </p>
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
                      const best = isManager ? teamRecord(sessions, p.id, true).value : personalBest(sessions, me.id, p.id).best
                      return (
                        <tr key={p.id} className="border-b border-slate-800 last:border-0">
                          <th scope="row" className="px-4 py-3 font-medium text-white">{p.label}</th>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-50">{b.attempts.value ?? '—'}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-50">{b.defeated.value ?? '—'}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-50">{best ?? '—'}</td>
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
          initialDifficulty={normaliseDifficulty(briefing.persona.difficulty_default)}
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
