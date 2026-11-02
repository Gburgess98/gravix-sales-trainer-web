// Persona library model (staging prototype). Pure: no React, no network.
//
// The rules below MIRROR docs/sparring-arena/PRIVATE_PERSONAS_API.md for UX and testing. They are NOT security:
// ownership, tenant and approval must be enforced by the API, which does not support them yet. Until it does, the
// prototype keeps a rep's personas in this browser only (see `readStore` / `writeStore`) and the UI says so.

import type { ApiPersona, ArenaMode, Difficulty } from './sparring-arena'

// Local copy (type-only imports above are erased, so this module stays loadable by plain `node --test`).
const normaliseDifficulty = (raw?: string | null): Difficulty => {
  const d = String(raw ?? '').toLowerCase()
  return d === 'easy' || d === 'hard' || d === 'nightmare' ? d : 'normal'
}

export type PersonaStatus = 'private' | 'submitted' | 'team_approved' | 'archived'
export type ObjectionStyle = 'price' | 'hostile' | 'disengaged' | 'numbers_risk' | 'process'
export type LengthPref = 'quick' | 'standard' | 'long'

export type LibraryPersona = {
  id: string
  ownerId: string
  companyId: string | null
  status: PersonaStatus
  name: string
  jobRole: string
  industry: string
  context: string
  objectionStyle: ObjectionStyle
  traits: string[]
  difficulty: Difficulty
  lengthPref: LengthPref
  /** Built-in engine that actually drives the buyer today (derived from objectionStyle, never user-chosen). */
  baseEngineId: string
  sourcePersonaId: string | null
  /** Set when a manager rejected a submission; the persona stays private and usable. */
  reviewOutcome: 'approved' | 'rejected' | null
  /** Where an archived persona goes back to on restore. */
  archivedFrom: PersonaStatus | null
  createdAt: string
  updatedAt: string
}

export type Viewer = { id: string; tier: string | null; companyId: string | null }

export const MANAGER_TIERS = ['Manager', 'Owner', 'PartnerAdmin', 'SuperAdmin']
export const isManager = (v: Viewer) => !!v.tier && MANAGER_TIERS.includes(v.tier)
const sameTenant = (p: LibraryPersona, v: Viewer) => !!p.companyId && !!v.companyId && p.companyId === v.companyId

// ───────────────────────── wizard options ─────────────────────────

export const OBJECTION_STYLES: { id: ObjectionStyle; label: string; hint: string; baseEngineId: string; objective: string }[] = [
  { id: 'price', label: 'Pushes back on price', hint: 'Questions cost and ROI early and often.', baseEngineId: 'price_sensitive', objective: 'Hold value against a cheaper alternative without discounting first.' },
  { id: 'hostile', label: 'Impatient or hostile', hint: 'Interrupts, demands quick, strong answers.', baseEngineId: 'angry', objective: 'Stay calm, acknowledge the frustration, then earn the next step.' },
  { id: 'disengaged', label: 'Quiet and disengaged', hint: 'Short answers; you carry the conversation.', baseEngineId: 'silent', objective: 'Create momentum with sharp questions and summaries.' },
  { id: 'numbers_risk', label: 'Wants numbers and proof', hint: 'Analytical, sceptical, risk averse.', baseEngineId: 'cfo', objective: 'Frame a quantified upside and de-risk the decision.' },
  { id: 'process', label: 'Hides behind process', hint: 'Policy, committees and existing vendors.', baseEngineId: 'procurement', objective: 'Navigate the process and reach the real decision-maker.' },
]

export const TRAIT_OPTIONS = ['Analytical', 'Impatient', 'Sceptical', 'Friendly but vague', 'Time-poor', 'Risk averse', 'Competitive', 'Detail-obsessed', 'Indecisive', 'Wary of vendors']

export const LENGTH_OPTIONS: { id: LengthPref; label: string; minutes: [number, number]; mode: ArenaMode; hint: string }[] = [
  { id: 'quick', label: 'Quick', minutes: [2, 3], mode: 'close_2m', hint: 'A two-minute closing drill.' },
  { id: 'standard', label: 'Standard', minutes: [5, 8], mode: 'standard', hint: 'A full conversation.' },
  { id: 'long', label: 'Extended', minutes: [8, 12], mode: 'standard', hint: 'A longer, deeper conversation.' },
]

export const styleOf = (id: ObjectionStyle) => OBJECTION_STYLES.find((s) => s.id === id) ?? OBJECTION_STYLES[0]
export const lengthOf = (id: LengthPref) => LENGTH_OPTIONS.find((l) => l.id === id) ?? LENGTH_OPTIONS[1]

export const STATUS_LABEL: Record<PersonaStatus, string> = {
  private: 'Private',
  submitted: 'Submitted',
  team_approved: 'Team approved',
  archived: 'Archived',
}

// ───────────────────────── permissions ─────────────────────────

/** Visibility. Not visible and cross-tenant both mean "does not exist" (the API answers 404 for both). */
export function canSee(p: LibraryPersona, v: Viewer): boolean {
  if (p.ownerId === v.id) return true
  if (p.status === 'team_approved') return sameTenant(p, v)
  if (p.status === 'submitted') return isManager(v) && sameTenant(p, v) // approval queue
  if (p.status === 'archived' && p.archivedFrom === 'team_approved') return isManager(v) && sameTenant(p, v)
  return false // other people's private personas are never visible, to managers either
}

export function canUse(p: LibraryPersona, v: Viewer): boolean {
  if (!canSee(p, v) || p.status === 'archived') return false
  if (p.ownerId === v.id) return true
  return p.status === 'team_approved' // others may only use team-approved
}

/** Only the owner, and only while private. Submitted is read-only until withdrawn; team personas need a duplicate. */
export const canEdit = (p: LibraryPersona, v: Viewer) => p.ownerId === v.id && p.status === 'private'
export const canDuplicate = (p: LibraryPersona, v: Viewer) => canSee(p, v) && p.status !== 'archived'
export const canSubmit = (p: LibraryPersona, v: Viewer) => p.ownerId === v.id && p.status === 'private'
export const canWithdraw = (p: LibraryPersona, v: Viewer) => p.ownerId === v.id && p.status === 'submitted'
export const canReview = (p: LibraryPersona, v: Viewer) => p.status === 'submitted' && isManager(v) && sameTenant(p, v)
export function canArchive(p: LibraryPersona, v: Viewer): boolean {
  if (p.status === 'private') return p.ownerId === v.id
  if (p.status === 'team_approved') return isManager(v) && sameTenant(p, v)
  return false
}

export type Action = 'submit' | 'withdraw' | 'approve' | 'reject' | 'archive' | 'restore'
export type TransitionResult = { ok: true; persona: LibraryPersona } | { ok: false; error: 'forbidden' | 'invalid_transition' }

/** State machine. Reject returns the persona to `private` (kept and usable); nothing is ever deleted. */
export function transition(p: LibraryPersona, action: Action, actor: Viewer, now = new Date().toISOString()): TransitionResult {
  const done = (patch: Partial<LibraryPersona>): TransitionResult => ({ ok: true, persona: { ...p, ...patch, updatedAt: now } })
  switch (action) {
    case 'submit':
      if (!canSubmit(p, actor)) return { ok: false, error: p.ownerId === actor.id ? 'invalid_transition' : 'forbidden' }
      return done({ status: 'submitted', reviewOutcome: null })
    case 'withdraw':
      if (!canWithdraw(p, actor)) return { ok: false, error: p.ownerId === actor.id ? 'invalid_transition' : 'forbidden' }
      return done({ status: 'private' })
    case 'approve':
      if (!canReview(p, actor)) return { ok: false, error: p.status === 'submitted' ? 'forbidden' : 'invalid_transition' }
      return done({ status: 'team_approved', reviewOutcome: 'approved' })
    case 'reject':
      if (!canReview(p, actor)) return { ok: false, error: p.status === 'submitted' ? 'forbidden' : 'invalid_transition' }
      return done({ status: 'private', reviewOutcome: 'rejected' })
    case 'archive':
      if (p.status !== 'private' && p.status !== 'team_approved') return { ok: false, error: 'invalid_transition' }
      if (!canArchive(p, actor)) return { ok: false, error: 'forbidden' }
      return done({ status: 'archived', archivedFrom: p.status })
    case 'restore': {
      if (p.status !== 'archived' || !p.archivedFrom) return { ok: false, error: 'invalid_transition' }
      const mine = p.archivedFrom === 'private' && p.ownerId === actor.id
      const team = p.archivedFrom === 'team_approved' && isManager(actor) && sameTenant(p, actor)
      if (!mine && !team) return { ok: false, error: 'forbidden' }
      return done({ status: p.archivedFrom, archivedFrom: null })
    }
  }
}

// ───────────────────────── lists ─────────────────────────

/** "All Personas" shared library: team-approved (manager-created or manager-approved) personas in the viewer's company. */
export const sharedPersonas = (all: LibraryPersona[], v: Viewer) => all.filter((p) => p.status === 'team_approved' && sameTenant(p, v))

/** "My Personas": the viewer's own, newest first. Archived only on request. */
export function myPersonas(all: LibraryPersona[], v: Viewer, includeArchived = false) {
  return all
    .filter((p) => p.ownerId === v.id && (includeArchived || p.status !== 'archived'))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export const MAX_ACTIVE_PRIVATE = 20

// ───────────────────────── drafts ─────────────────────────

export type Draft = {
  name: string
  jobRole: string
  industry: string
  context: string
  objectionStyle: ObjectionStyle | ''
  traits: string[]
  difficulty: Difficulty
  lengthPref: LengthPref
}

export const emptyDraft = (): Draft => ({ name: '', jobRole: '', industry: '', context: '', objectionStyle: '', traits: [], difficulty: 'normal', lengthPref: 'standard' })

/** Strip control characters, collapse whitespace, trim. Persona text ends up in an LLM prompt: treat as untrusted. */
export function sanitiseText(s: string): string {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export type DraftErrors = Partial<Record<keyof Draft, string>>

export function validateDraft(d: Draft, step: 1 | 2 | 3 | 4 = 4): DraftErrors {
  const e: DraftErrors = {}
  const name = sanitiseText(d.name)
  const role = sanitiseText(d.jobRole)
  if (step >= 1) {
    if (name.length < 2) e.name = 'Give them a name (2–60 characters).'
    else if (name.length > 60) e.name = 'Keep the name under 60 characters.'
    if (!role) e.jobRole = 'Add their job role.'
    else if (role.length > 80) e.jobRole = 'Keep the role under 80 characters.'
    if (sanitiseText(d.industry).length > 80) e.industry = 'Keep the industry under 80 characters.'
  }
  if (step >= 2) {
    if (!d.objectionStyle) e.objectionStyle = 'Choose how they will challenge you.'
    if (d.traits.length > 5) e.traits = 'Pick up to five traits.'
    if (sanitiseText(d.context).length > 400) e.context = 'Keep the context under 400 characters.'
  }
  return e
}

export function fromPersona(p: LibraryPersona): Draft {
  return { name: p.name, jobRole: p.jobRole, industry: p.industry, context: p.context, objectionStyle: p.objectionStyle, traits: p.traits, difficulty: p.difficulty, lengthPref: p.lengthPref }
}

export function createPrivate(draft: Draft, owner: Viewer, id: string, now = new Date().toISOString(), sourcePersonaId: string | null = null): LibraryPersona {
  const style = styleOf((draft.objectionStyle || 'price') as ObjectionStyle)
  return {
    id,
    ownerId: owner.id,
    companyId: owner.companyId,
    status: 'private',
    name: sanitiseText(draft.name),
    jobRole: sanitiseText(draft.jobRole),
    industry: sanitiseText(draft.industry),
    context: sanitiseText(draft.context),
    objectionStyle: style.id,
    traits: draft.traits.map(sanitiseText).filter(Boolean).slice(0, 5),
    difficulty: normaliseDifficulty(draft.difficulty),
    lengthPref: lengthOf(draft.lengthPref).id,
    baseEngineId: style.baseEngineId,
    sourcePersonaId,
    reviewOutcome: null,
    archivedFrom: null,
    createdAt: now,
    updatedAt: now,
  }
}

export function applyEdit(p: LibraryPersona, draft: Draft, actor: Viewer, now = new Date().toISOString()): LibraryPersona | null {
  if (!canEdit(p, actor)) return null
  const next = createPrivate(draft, actor, p.id, now, p.sourcePersonaId)
  return { ...next, createdAt: p.createdAt }
}

/** Duplicate anything the viewer can see into a new PRIVATE persona they own (the only way to "edit" a team persona). */
export function duplicate(source: LibraryPersona, owner: Viewer, id: string, now = new Date().toISOString()): LibraryPersona | null {
  if (!canDuplicate(source, owner)) return null
  return createPrivate({ ...fromPersona(source), name: `Copy of ${source.name}`.slice(0, 60) }, owner, id, now, source.id)
}

// ───────────────────────── bridge to the existing arena ─────────────────────────

/** Shape the carousel/briefing already understand. */
export function toApiPersona(p: LibraryPersona): ApiPersona {
  return { id: p.id, label: p.name, description: p.context || styleOf(p.objectionStyle).hint, traits: p.traits, difficulty_default: p.difficulty }
}

/** Prototype start request: the engine only knows the built-in personas, so the buyer runs on the closest one. */
export function startPlanFor(p: LibraryPersona): { personaId: string; difficulty: Difficulty; mode: ArenaMode } {
  return { personaId: p.baseEngineId, difficulty: p.difficulty, mode: lengthOf(p.lengthPref).mode }
}

// ───────────────────────── prototype store (this browser only) ─────────────────────────

const KEY = (userId: string) => `gravix.arena.personas.v1:${userId}`
const STATUSES: PersonaStatus[] = ['private', 'submitted', 'team_approved', 'archived']

function isPersona(x: unknown): x is LibraryPersona {
  const p = x as LibraryPersona
  return !!p && typeof p.id === 'string' && typeof p.ownerId === 'string' && typeof p.name === 'string' &&
    STATUSES.includes(p.status) && OBJECTION_STYLES.some((s) => s.id === p.objectionStyle) && Array.isArray(p.traits)
}

/** Reads this user's local personas. Corrupt or foreign data is ignored, never thrown. */
export function parseStore(raw: string | null, userId: string): LibraryPersona[] {
  if (!raw) return []
  try {
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list.filter(isPersona).filter((p) => p.ownerId === userId) : []
  } catch {
    return []
  }
}

export function readStore(userId: string): LibraryPersona[] {
  try {
    return parseStore(window.localStorage.getItem(KEY(userId)), userId)
  } catch {
    return []
  }
}

export function writeStore(userId: string, list: LibraryPersona[]): boolean {
  try {
    window.localStorage.setItem(KEY(userId), JSON.stringify(list.filter((p) => p.ownerId === userId)))
    return true
  } catch {
    return false
  }
}
