// Starts a sparring session through the EXISTING endpoint (same body as SparringStartButton). Shared by the arena and
// the persona wizard so there is one start path. Returns the new session id or throws with a readable message.
import { proxyFetch } from '@/lib/api'
import { buildStartBody, type ArenaMode } from '@/lib/sparring-arena'

export async function startSparringSession(input: {
  personaId: string
  difficulty: string
  mode: ArenaMode
  assignmentId?: string | null
}): Promise<string> {
  const res = await proxyFetch('/api/proxy/v1/sparring/sessions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(buildStartBody(input)),
    cache: 'no-store',
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || !json || json.ok === false || !json.session?.id) {
    throw new Error(json?.error || 'Failed to start sparring session.')
  }
  return String(json.session.id)
}
