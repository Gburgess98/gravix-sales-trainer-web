// Pure model for the Sparring Arena (staging prototype). No React, no network.
// See docs/sparring-arena/AUDIT.md for what each statistic is (real / derived / unavailable / placeholder / demo).

/** Where a displayed number comes from. The UI shows this next to anything that is not plainly real. */
export type Provenance = 'real' | 'derived' | 'unavailable' | 'placeholder' | 'demo'

export type Difficulty = 'easy' | 'normal' | 'hard' | 'nightmare'

/** Shape of GET /v1/sparring/personas items. */
export type ApiPersona = {
  id: string
  label: string
  description?: string | null
  traits?: string[] | null
  difficulty_default?: string | null
}

/** Shape of GET /v1/sparring/sessions items (only the fields the arena reads). */
export type ApiSession = {
  id: string
  rep_id?: string | null
  persona_id?: string | null
  difficulty?: string | null
  total?: number | null
  xp_awarded?: number | null
  created_at?: string | null
  duration_ms?: number | null
}

/** Shape of GET /v1/sparring/leaderboard/:personaId. */
export type ApiLeaderboard = {
  ok?: boolean
  wins?: number
  losses?: number
  total?: number
  winRate?: number | null
}

/** A session counts as defeating the persona at this score (the API leaderboard's own definition). */
export const PASS_SCORE = 80

export const MANAGER_TIERS = new Set(['Manager', 'Owner', 'PartnerAdmin', 'SuperAdmin'])
export const isManagerTier = (tier?: string | null) => !!tier && MANAGER_TIERS.has(tier)

// ───────────────────────── carousel maths ─────────────────────────

/** Signed shortest distance of `index` from `active` on a loop of `count` items (right side wins ties). */
export function loopOffset(index: number, active: number, count: number): number {
  if (count <= 0) return 0
  const d = (((index - active) % count) + count) % count
  return d > count / 2 ? d - count : d
}

/** Step the active index around the loop. */
export function stepIndex(active: number, delta: number, count: number): number {
  if (count <= 0) return 0
  return (((active + delta) % count) + count) % count
}

// ───────────────────────── difficulty ─────────────────────────

export function normaliseDifficulty(raw?: string | null): Difficulty {
  const d = String(raw ?? '').toLowerCase()
  return d === 'easy' || d === 'hard' || d === 'nightmare' ? d : 'normal'
}

export const DIFFICULTY_META: Record<Difficulty, { label: string; level: 1 | 2 | 3 | 4 }> = {
  easy: { label: 'Easy', level: 1 },
  normal: { label: 'Normal', level: 2 },
  hard: { label: 'Hard', level: 3 },
  nightmare: { label: 'Nightmare', level: 4 },
}

// ───────────────────── presentation copy (PLACEHOLDER) ─────────────────────
// The API has no role / industry / objection style / session length. This is temporary presentation copy keyed by
// the five persona ids the API serves today. It is descriptive text, never a statistic, and the UI labels it as such.

export type PersonaPresentation = {
  role: string
  context: string
  objectionStyle: string
  estMinutes: [number, number]
  objective: string
}

export const PERSONA_PRESENTATION: Record<string, PersonaPresentation> = {
  price_sensitive: {
    role: 'Head of Operations',
    context: 'Mid-market services · renewal season',
    objectionStyle: 'Challenges price early and often',
    estMinutes: [5, 8],
    objective: 'Hold value against a lower quote without discounting first.',
  },
  angry: {
    role: 'VP Customer Success',
    context: 'Enterprise SaaS · recent bad vendor experience',
    objectionStyle: 'Interrupts and demands justification',
    estMinutes: [5, 8],
    objective: 'Stay calm, acknowledge the frustration, then earn the next step.',
  },
  silent: {
    role: 'Finance Director',
    context: 'Manufacturing · guarded, time-poor',
    objectionStyle: 'One-word answers, low engagement',
    estMinutes: [6, 10],
    objective: 'Create momentum with sharp questions and summaries.',
  },
  cfo: {
    role: 'Chief Financial Officer',
    context: 'Scale-up · risk review in progress',
    objectionStyle: 'Wants numbers, risk and proof',
    estMinutes: [6, 10],
    objective: 'Frame a clear, quantified upside and de-risk the decision.',
  },
  procurement: {
    role: 'Procurement Lead',
    context: 'Regulated industry · formal vendor process',
    objectionStyle: 'Policy, process and committees',
    estMinutes: [5, 8],
    objective: 'Navigate the process and secure a path to the real decision-maker.',
  },
}

export function presentationFor(persona: ApiPersona): PersonaPresentation {
  return (
    PERSONA_PRESENTATION[persona.id] ?? {
      role: 'Prospect',
      context: persona.traits?.slice(0, 2).join(' · ') || 'Live buyer simulation',
      objectionStyle: persona.traits?.[0] || 'Varied objections',
      estMinutes: [5, 8],
      objective: persona.description || 'Run a full discovery-to-close conversation.',
    }
  )
}

// ───────────────────────── statistics (honest derivation) ─────────────────────────

export type Stat<T> = { value: T | null; provenance: Provenance; note?: string }

const scoreOf = (s: ApiSession) => (typeof s.total === 'number' && Number.isFinite(s.total) ? s.total : null)

/** Your own best score and attempts for a persona, from the sessions list. Derived (list is the latest 50 only). */
export function personalBest(sessions: ApiSession[], repId: string | null, personaId: string) {
  const mine = repId ? sessions.filter((s) => s.rep_id === repId && s.persona_id === personaId) : []
  const scores = mine.map(scoreOf).filter((n): n is number => n !== null)
  return {
    best: (scores.length ? Math.max(...scores) : null) as number | null,
    attempts: mine.length,
    defeated: scores.filter((n) => n >= PASS_SCORE).length,
  }
}

/**
 * Highest score on a persona across the sessions the caller may see. For a rep that is only their own sessions,
 * so it is NOT a team record: `team` is only claimed for manager tiers.
 */
export function teamRecord(sessions: ApiSession[], personaId: string, isManager: boolean): Stat<number> {
  if (!isManager) {
    return { value: null, provenance: 'unavailable', note: 'Team records are visible to managers only (API scope).' }
  }
  const scores = sessions
    .filter((s) => s.persona_id === personaId)
    .map(scoreOf)
    .filter((n): n is number => n !== null)
  return scores.length
    ? { value: Math.max(...scores), provenance: 'derived', note: 'Best score in the latest 50 team sessions.' }
    : { value: null, provenance: 'derived', note: 'No scored team sessions yet.' }
}

export type PersonaRecord = {
  attempts: Stat<number>
  defeated: Stat<number>
  scope: 'team' | 'you'
}

/** Leaderboard aggregates. Real numbers; scope is the caller's (tenant for managers, own sessions for reps). */
export function summariseLeaderboard(lb: ApiLeaderboard | null, isManager: boolean): PersonaRecord {
  const scope = isManager ? 'team' : 'you'
  if (!lb || lb.ok === false) {
    return {
      scope,
      attempts: { value: null, provenance: 'unavailable' },
      defeated: { value: null, provenance: 'unavailable' },
    }
  }
  return {
    scope,
    attempts: { value: typeof lb.total === 'number' ? lb.total : 0, provenance: 'real' },
    defeated: { value: typeof lb.wins === 'number' ? lb.wins : 0, provenance: 'real' },
  }
}

/** Challenge copy built ONLY from supplied stats. Returns null lines when the data does not exist. */
export function challengeLines(input: {
  isManager: boolean
  record: Stat<number>
  yourBest: number | null
  leaderboard: PersonaRecord
}): string[] {
  const lines: string[] = []
  if (input.record.value !== null) lines.push(`Team record: ${input.record.value}/100. Can you beat it?`)
  const a = input.leaderboard.attempts.value
  const d = input.leaderboard.defeated.value
  if (a !== null && d !== null) {
    lines.push(
      input.leaderboard.scope === 'team'
        ? `${a} attempt${a === 1 ? '' : 's'} by your team · ${d} defeated this persona (80+)`
        : `${a} attempt${a === 1 ? '' : 's'} by you · ${d} scored 80+`,
    )
  }
  if (input.yourBest !== null) lines.push(`Your best: ${input.yourBest}/100`)
  return lines
}

// ───────────────────────── demo preview (always stamped) ─────────────────────────

/** Mock numbers for design review only. Never persisted; the UI stamps every use with a DEMO chip and banner. */
export const DEMO_STATS = {
  teamRecordXp: 8420,
  repsAttempted: 37,
  repsDefeated: 9,
  yourBestXp: 7180,
} as const

// ───────────────────────── start request (mirrors SparringStartButton) ─────────────────────────

export type ArenaMode = 'standard' | 'time_trial' | 'close_2m'

/**
 * Body for POST /v1/sparring/sessions. Identical contract to SparringStartButton:
 * close_2m is a time_trial with a 120 s target. `assignmentId` is an existing accepted field.
 */
export function buildStartBody(input: {
  personaId: string
  difficulty: string
  mode: ArenaMode
  assignmentId?: string | null
}) {
  const body: Record<string, unknown> = {
    personaId: input.personaId,
    difficulty: input.difficulty,
    meta: { opponent_profile: { jobTitle: null, industry: null, companySize: null } },
  }
  if (input.mode === 'standard') body.mode = 'standard'
  else if (input.mode === 'time_trial') body.mode = 'time_trial'
  else {
    body.mode = 'time_trial'
    body.targetDurationSec = 120
  }
  if (input.assignmentId) body.assignmentId = input.assignmentId
  return body
}

export type MicState = 'unknown' | 'granted' | 'prompt' | 'denied' | 'unsupported'
