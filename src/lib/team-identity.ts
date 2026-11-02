// Shared rep/member display identity. Pure (no React, no I/O). The roster from GET /v1/team/members is the
// authoritative source of a person's name; a route/param UUID is only ever an internal key, never a label.

export type IdentityMember = { id: string; name?: string | null; email?: string | null }

const UUID_LIKE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const NEUTRAL_MEMBER_LABEL = 'Team member'

export const looksLikeUuid = (s: string | null | undefined) => UUID_LIKE_RE.test(String(s ?? '').trim())

/** valid name > email local part > "Team member". The API name falls back to the id for identity-less rows, so guard here too. */
export function memberLabel(member: Pick<IdentityMember, 'name' | 'email'> | null | undefined): string {
  const name = member?.name?.trim()
  if (name && !looksLikeUuid(name) && !name.includes('@')) return name

  const email = (name?.includes('@') ? name : member?.email ?? '').trim()
  const local = email.includes('@') ? email.split('@')[0]?.trim() : ''
  if (local && !looksLikeUuid(local)) return local

  return NEUTRAL_MEMBER_LABEL
}

export function memberInitials(member: Pick<IdentityMember, 'name' | 'email'> | null | undefined): string {
  const label = memberLabel(member)
  if (label === NEUTRAL_MEMBER_LABEL) return 'TM'
  const parts = label.split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? ''
  const second = parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] ?? ''
  return `${first}${second}`.toUpperCase() || 'TM'
}

/** Match the route id against the roster (case-insensitive) and return a customer-safe display name. */
export function resolveRepName(members: IdentityMember[] | null | undefined, repId: string | null | undefined): string {
  const id = String(repId ?? '').trim().toLowerCase()
  const match = id ? (members ?? []).find((m) => String(m?.id ?? '').trim().toLowerCase() === id) : undefined
  return memberLabel(match)
}
