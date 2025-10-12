// web/src/lib/api.ts

// ---- Retry helper (yours) ----
import { fetchJsonWithRetry } from "@/lib/fetchJsonWithRetry";

// Use the same-origin proxy so we avoid CORS and inject x-user-id server-side
const PROXY = "/api/proxy";

// -------------------------------
// Types
// -------------------------------

export type CallDetail = any & {
  signedAudioUrl?: string;
  signedTtl?: number;
};

export type CallsPageResp<T = any> = {
  ok: boolean;
  items: T[];
  calls?: T[];              // legacy alias
  nextCursor: string | null;
};

export type PinRow = any;

export type ScoreHistoryItem = {
  score: number;           // unified field used by sparkline
  created_at: string;      // ISO
  rubric?: string | null;  // optional
};

export type ContactHit = {
  id: string;
  name: string | null;
  email: string | null;
  company: string | null;
};

// -------------------------------
// Small JSON fetcher with consistent errors
// (wraps your fetchJsonWithRetry, preserves credentials + no-store)
// -------------------------------
async function jfetch<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetchJsonWithRetry<any>(url, {
    credentials: "include",
    cache: "no-store",
    ...(init || {}),
  });
  if (!r?.ok) throw new Error(r?.error || `HTTP error for ${url}`);
  return r as T;
}

// -------------------------------
// Calls
// -------------------------------

/** Get call detail + short-lived signed audio URL */
export async function getCall(callId: string): Promise<{ call: CallDetail }> {
  const detailResp = await jfetch<{ ok: true; call: CallDetail }>(
    `${PROXY}/v1/calls/${encodeURIComponent(callId)}`
  );

  // Try to fetch a signed audio URL (best-effort)
  try {
    const au = await jfetch<{ ok: true; url: string; ttl: number }>(
      `${PROXY}/v1/calls/${encodeURIComponent(callId)}/audio-url`
    );
    detailResp.call.signedAudioUrl = au.url;
    detailResp.call.signedTtl = au.ttl;
  } catch {
    // optional; ignore
  }

  return { call: detailResp.call };
}

/** Simple first page of recent calls */
export async function listRecentCalls(limit = 20): Promise<{ calls: any[] }> {
  const j = await jfetch<{ ok: true; items?: any[]; calls?: any[] }>(
    `${PROXY}/v1/calls?limit=${limit}`
  );
  return { calls: j.calls || j.items || [] };
}

/** Cursor-based page for Recent Calls */
export async function getCallsPage(limit = 10, cursor?: string | null) {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (cursor) qs.set("cursor", cursor);
  const j = await jfetch<CallsPageResp>(`${PROXY}/v1/calls?${qs.toString()}`);
  return { ok: true, items: j.items || j.calls || [], nextCursor: j.nextCursor ?? null } as CallsPageResp;
}

/** Manually set score (admin / debug) */
export async function setScore(callId: string, score: number, rubric?: any) {
  const j = await jfetch<{ ok: true; call: any }>(
    `${PROXY}/v1/calls/${encodeURIComponent(callId)}/score`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score_overall: score, rubric }),
    }
  );
  return j.call;
}

// -------------------------------
// Uploads (signed upload flow)
// -------------------------------

/**
 * Use proxy for consistency (frontend -> /api/proxy -> API).
 * If you want to hit API origin directly, swap PROXY with:
 *   const base = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_API_BASE;
 *   const url = `${base}/v1/upload/signed`;
 * and keep your x-user-id dev header as before.
 */
export async function signedInitUpload(meta: { filename: string; mime?: string; size?: number }) {
  const j = await jfetch<{ ok: true; path: string; url: string; id: string; kind: "audio" | "json" }>(
    `${PROXY}/v1/upload/signed`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(meta),
    }
  );
  return j;
}

/** Finalize signed upload (create DB row + enqueue jobs) */
export async function finalizeSignedUpload(body: {
  path: string;
  filename: string;
  mime?: string;
  size?: number;
  sha256?: string;
}) {
  const j = await jfetch<{ ok: true; callId: string; jobId: string }>(
    `${PROXY}/v1/upload/finalize`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  return j;
}

// -------------------------------
// Pins
// -------------------------------

/** List pins */
export async function listPins(callId: string): Promise<{ pins: PinRow[] }> {
  const j = await jfetch<{ ok: true; pins: PinRow[] }>(
    `${PROXY}/v1/pins?callId=${encodeURIComponent(callId)}`
  );
  return { pins: j.pins || [] };
}

/** Create pin */
export async function createPin(input: { callId: string; t: number; note: string | null }) {
  const j = await jfetch<{ ok: true; pin: PinRow }>(`${PROXY}/v1/pins`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return j.pin;
}

/** Delete pin */
export async function deletePin(pinId: string) {
  await jfetch<{ ok: true }>(`${PROXY}/v1/pins/${encodeURIComponent(pinId)}`, {
    method: "DELETE",
  });
  return true;
}

// -------------------------------
// Score history (for sparkline)
// -------------------------------

export async function getScoreHistory(callId: string, limit = 24): Promise<ScoreHistoryItem[]> {
  const j = await jfetch<{ ok: true; items: any[] }>(
    `${PROXY}/v1/calls/${encodeURIComponent(callId)}/scores?limit=${limit}`
  );

  // Normalize to { score, created_at }
  const items = (j.items || []).map((r: any) => ({
    score: typeof r.overall === "number" ? r.overall : r.score,
    created_at: r.created_at,
    rubric: r.rubric ?? r.rubric_version ?? null,
  })) as ScoreHistoryItem[];

  return items;
}

// -------------------------------
// CRM helpers
// -------------------------------

export async function searchContacts(query: string, limit = 12) {
  const qs = new URLSearchParams({ query, limit: String(limit) });
  const r = await jfetch<{ ok: true; items: ContactHit[] }>(
    `${PROXY}/v1/crm/contacts?${qs.toString()}`
  );
  return r.items;
}

export async function linkCallByEmail(callId: string, email: string) {
  const r = await jfetch<{ ok: true; link: any }>(`${PROXY}/v1/crm/link-call`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callId, email }),
  });
  return r.link;
}

export async function getCrmLink(callId: string) {
  const r = await jfetch<{ ok: true; link: any }>(`${PROXY}/v1/crm/calls/${callId}/link`);
  return r.link;
}

// -------------------------------
// Optional helpers
// -------------------------------

/** Latest job for a call (if your API exposes it) */
export async function getLatestJobForCall(callId: string) {
  const j = await jfetch<{ ok: true; job: any }>(
    `${PROXY}/v1/calls/${encodeURIComponent(callId)}/jobs/latest`
  );
  return j.job;
}
