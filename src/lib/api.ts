// web/src/lib/api.ts

import { fetchJsonWithRetry } from "@/lib/fetchJsonwithretry";

// Always go through the Next proxy so we avoid CORS and can inject x-user-id server-side.
const PROXY = "/api/proxy";

// -------------------------------
// Auth header injection (client-side)
// -------------------------------

function getSupabaseUserIdFromStorage(): string | null {
  if (typeof window === "undefined") return null;

  try {
    // Supabase v2 default storage key shape: sb-<project-ref>-auth-token
    // We'll search for any key ending in "-auth-token" to keep this robust.
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k) continue;
      if (!k.includes("auth-token")) continue;

      const raw = window.localStorage.getItem(k);
      if (!raw) continue;

      let parsed: any = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }

      const uid =
        parsed?.user?.id ||
        parsed?.currentSession?.user?.id ||
        parsed?.data?.user?.id ||
        null;

      if (typeof uid === "string" && uid.length > 10) return uid;
    }
  } catch {
    // ignore
  }

  return null;
}

function withUserIdHeaders(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers || {});

  // If caller already provided x-user-id, respect it.
  if (!headers.get("x-user-id")) {
    const uid = getSupabaseUserIdFromStorage();
    if (uid) {
      headers.set("x-user-id", uid);
      // keep the aliases aligned (helps back-compat across endpoints)
      headers.set("x-gravix-user-id", uid);
      headers.set("x-forwarded-user-id", uid);
    }
  }

  return {
    ...(init || {}),
    headers,
  };
}

async function apiFetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  return await fetchJsonWithRetry<T>(url, withUserIdHeaders(init));
}

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
  calls?: T[];              // server may send "calls"; we normalize to items
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
// Admin config
// -------------------------------
export type AdminConfig = {
  streak_threshold: number;
  xp_multiplier: number;
  comeback_bonus: number;
  updated_at?: string;
};

// -------------------------------
// Small JSON fetcher with consistent errors
// -------------------------------
async function jfetch<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await apiFetchJson<any>(url, {
    credentials: "include",
    cache: "no-store",
    ...(init || {}),
  });
  if (!r?.ok) throw new Error(r?.error || `HTTP error for ${url}`);
  return r as T;
}

export async function getAdminConfig(): Promise<AdminConfig> {
  const j = await jfetch<{ ok: true; config: AdminConfig }>(
    `${PROXY}/v1/admin/config`
  );
  return j.config;
}

export async function patchAdminConfig(
  patch: Partial<Pick<AdminConfig, "streak_threshold" | "xp_multiplier" | "comeback_bonus">>
): Promise<AdminConfig> {
  const j = await jfetch<{ ok: true; config: AdminConfig }>(
    `${PROXY}/v1/admin/config`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }
  );
  return j.config;
}

// -------------------------------
// Calls
// -------------------------------

/** Get call detail + short-lived signed audio URL */
export async function getCall(callId: string): Promise<{ call: CallDetail }> {
  const detailResp = await jfetch<{ ok: true; call: CallDetail }>(
    `${PROXY}/v1/calls/${encodeURIComponent(callId)}`
  );

  // Best-effort signed URL for audio playback
  try {
    const au = await jfetch<{ ok: true; url: string; ttl: number }>(
      `${PROXY}/v1/calls/${encodeURIComponent(callId)}/audio-url`
    );
    detailResp.call.signedAudioUrl = au.url;
    detailResp.call.signedTtl = au.ttl;
  } catch {
    // ignore if not available
  }

  return { call: detailResp.call };
}

/** (Legacy) simple list – kept for compatibility if anything still calls it */
export async function listRecentCalls(limit = 20): Promise<{ calls: any[] }> {
  const j = await jfetch<{ ok: true; items?: any[]; calls?: any[] }>(
    `${PROXY}/v1/calls?limit=${limit}`
  );
  return { calls: j.calls || j.items || [] };
}

/** Cursor-based page for Recent Calls (+ optional search q) */
export async function getCallsPage(limit = 10, cursor?: string | null, q?: string) {
  const qs = new URLSearchParams();
  qs.set("limit", String(limit));
  if (cursor) qs.set("cursor", cursor);
  if (q) qs.set("q", q);

  const j = await jfetch<CallsPageResp>(
    `${PROXY}/v1/calls/paged?${qs.toString()}`
  );

  // normalize shape
  return {
    ok: true,
    items: j.items || j.calls || [],
    nextCursor: j.nextCursor ?? null,
  } as CallsPageResp;
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

export async function listPins(callId: string): Promise<{ pins: PinRow[] }> {
  const j = await jfetch<{ ok: true; pins: PinRow[] }>(
    `${PROXY}/v1/pins?callId=${encodeURIComponent(callId)}`
  );
  return { pins: j.pins || [] };
}

export async function createPin(input: { callId: string; t: number; note: string | null }) {
  const j = await jfetch<{ ok: true; pin: PinRow }>(`${PROXY}/v1/pins`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return j.pin;
}

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

/** Optional: latest job for a call (if your API exposes it) */
export async function getLatestJobForCall(callId: string) {
  const j = await jfetch<{ ok: true; job: any }>(
    `${PROXY}/v1/calls/${encodeURIComponent(callId)}/jobs/latest`
  );
  return j.job;
}

// ---------------------------
// Sparring sessions
// ---------------------------

export type SparringSession = {
  id: string;
  created_at: string;
  rep_id: string;
  persona_id: string | null;
  total_score: number | null;
  xp_awarded: number | null;
};

export async function listSparringSessions(opts?: { limit?: number }) {
  const params = new URLSearchParams();
  if (opts?.limit) params.set("limit", String(opts.limit));

  const qs = params.toString();
  const url = `/api/proxy/v1/sparring/sessions${qs ? `?${qs}` : ""}`;

  const res = await apiFetchJson(url);
  // API shape: { ok: true, sessions: [...] }
  return (res.sessions ?? []) as SparringSession[];
}

// -------------------------------
// Sparring helpers
// -------------------------------

export type SparringSessionSummary = {
  id: string;
  rep_id: string | null;
  persona_id: string | null;
  total_score: number | null;
  xp_awarded: number | null;
  created_at: string;
};

export async function getSparringSessionsByRep(
  repId: string,
  limit: number = 5
): Promise<SparringSessionSummary[]> {
  if (!repId) return [];

  const params = new URLSearchParams({
    repId,
    limit: String(limit),
  });

  const res = await apiFetchJson<{
    ok: boolean;
    sessions?: SparringSessionSummary[];
    error?: string;
  }>(`${PROXY}/v1/sparring/sessions?${params.toString()}`);

  if (!res || (res as any).ok === false) {
    const msg =
      (res && (res as any).error) || "Failed to load sparring sessions";
    throw new Error(msg);
  }

  return res.sessions || [];
}

export async function scoreSparring(transcript: string, personaId: string) {
  const res = await apiFetchJson<{
    ok: boolean;
    personaId: string;
    scores: {
      tone?: number | null;
      discovery?: number | null;
      objection?: number | null;
      close?: number | null;
      overall?: number | null;
    };
    total?: number | null;
    xp_awarded?: number | null;
    error?: string;
  }>(`${PROXY}/v1/sparring/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript, personaId }),
  });

  if (!res || (res as any).ok === false) {
    const msg =
      (res && (res as any).error) || "Failed to score sparring session";
    throw new Error(msg);
  }

  return res;
}

export async function logSparringSession(body: {
  repId: string;
  personaId: string;
  transcript: string;
  totalScore?: number | null;
  xpAwarded?: number | null;
}) {
  const res = await apiFetchJson<{ ok: boolean; session: any }>(
    `${PROXY}/v1/sparring/log`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  if (!res || (res as any).ok === false) {
    const msg =
      (res && (res as any).error) || "Failed to log sparring session";
    throw new Error(msg);
  }

  return res.session;
}