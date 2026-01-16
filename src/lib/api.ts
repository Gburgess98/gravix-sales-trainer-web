// web/src/lib/api.ts

import { fetchJsonWithRetry } from "@/lib/fetchJsonwithretry";
import { supabaseBrowser } from "@/lib/supabaseClient";

// Always go through the Next proxy so we avoid CORS and can inject x-user-id server-side.
const PROXY = "/api/proxy";

// -------------------------------
// Auth header injection (client-side)
// -------------------------------

let _cachedUid: string | null = null;
let _cachedToken: string | null = null;
let _cachedAt = 0;

type BrowserAuth = { uid: string | null; token: string | null };

function tryDecodeJwtSub(token: string | null): string | null {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "===".slice((b64.length + 3) % 4);
    const json = JSON.parse(atob(padded));
    const sub = typeof json?.sub === "string" ? json.sub : null;
    return sub && sub.length > 10 ? sub : null;
  } catch {
    return null;
  }
}

function getSupabaseAuthFromStorage(): { uid: string | null; token: string | null } {
  if (typeof window === "undefined") return { uid: null, token: null };

  type Candidate = { uid: string; token: string | null; expiresAt: number };

  const extractCandidate = (raw: string | null): Candidate | null => {
    if (!raw) return null;

    let parsed: any = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }

    const uid =
      parsed?.user?.id ||
      parsed?.currentSession?.user?.id ||
      parsed?.data?.user?.id ||
      parsed?.session?.user?.id ||
      parsed?.data?.session?.user?.id ||
      null;

    const token =
      parsed?.access_token ||
      parsed?.currentSession?.access_token ||
      parsed?.data?.session?.access_token ||
      parsed?.session?.access_token ||
      null;

    // Supabase sessions often include `expires_at` (seconds since epoch)
    const expiresAt =
      Number(parsed?.expires_at) ||
      Number(parsed?.currentSession?.expires_at) ||
      Number(parsed?.data?.session?.expires_at) ||
      Number(parsed?.session?.expires_at) ||
      0;

    if (typeof uid !== "string" || uid.length <= 10) return null;

    return {
      uid,
      token: typeof token === "string" && token.length > 20 ? token : null,
      expiresAt: Number.isFinite(expiresAt) ? expiresAt : 0,
    };
  };

  const shouldConsiderKey = (k: string) => {
    // Supabase v2 commonly uses: sb-<project-ref>-auth-token
    if (k.includes("auth-token")) return true;
    // also allow broader matching for custom wrappers
    if (k.toLowerCase().includes("supabase") && k.toLowerCase().includes("auth")) return true;
    if (k.startsWith("sb-") && k.includes("-auth")) return true;
    return false;
  };

  const scanStorage = (s: Storage | undefined): Candidate[] => {
    if (!s) return [];
    const out: Candidate[] = [];

    try {
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (!k) continue;
        if (!shouldConsiderKey(k)) continue;

        const c = extractCandidate(s.getItem(k));
        if (c) out.push(c);
      }
    } catch {
      // ignore
    }

    return out;
  };

  // Prefer the most-recent (highest expires_at) across storages.
  const candidates = [...scanStorage(window.localStorage), ...scanStorage(window.sessionStorage)];

  if (!candidates.length) return { uid: null, token: null };

  candidates.sort((a, b) => (b.expiresAt || 0) - (a.expiresAt || 0));
  return { uid: candidates[0].uid, token: candidates[0].token };
}

async function getBrowserAuth(): Promise<BrowserAuth> {
  if (typeof window === "undefined") return { uid: null, token: null };

  const now = Date.now();
  if ((_cachedUid || _cachedToken) && now - _cachedAt < 30_000) {
    return { uid: _cachedUid, token: _cachedToken };
  }

  // 1) Prefer asking Supabase directly (most reliable)
  try {
    if (supabaseBrowser?.auth?.getSession) {
      const { data } = await supabaseBrowser.auth.getSession();
      const session = data?.session;
      const uid = (session?.user?.id || "").trim() || null;
      const token = (session?.access_token || "").trim() || null;

      if (uid || token) {
        _cachedUid = uid;
        _cachedToken = token;
        _cachedAt = now;
        return { uid, token };
      }
    }

    // fallback: getUser gives uid even if session read fails
    if (supabaseBrowser?.auth?.getUser) {
      const { data, error } = await supabaseBrowser.auth.getUser();
      if (!error) {
        const uid = (data?.user?.id || "").trim() || null;
        if (uid) {
          _cachedUid = uid;
          _cachedAt = now;
          return { uid, token: null };
        }
      }
    }
  } catch {
    // ignore (fallback to storage)
  }

  // 2) Fallback: attempt to pull from local/sessionStorage
  const { uid, token } = getSupabaseAuthFromStorage();
  _cachedUid = uid;
  _cachedToken = token;
  _cachedAt = now;
  return { uid, token };
}

async function withUserIdHeaders(init?: RequestInit): Promise<RequestInit> {
  const headers = new Headers(init?.headers || {});

  // Browser-only: attach auth so the proxy can resolve the user.
  if (typeof window !== "undefined") {
    const { uid, token } = await getBrowserAuth();

    // Prefer bearer token when present (set both casings for safety)
    if (token && !headers.get("authorization") && !headers.get("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
      headers.set("authorization", `Bearer ${token}`);
    }

    // If caller already provided x-user-id, respect it.
    if (!headers.get("x-user-id")) {
      // Prefer explicit uid from session/user; otherwise derive from JWT sub.
      const effectiveUid = uid || tryDecodeJwtSub(token);
      if (effectiveUid) {
        headers.set("x-user-id", effectiveUid);
        // keep the aliases aligned (helps back-compat across endpoints)
        headers.set("x-gravix-user-id", effectiveUid);
        headers.set("x-forwarded-user-id", effectiveUid);
      }
    }
  }

  // Always include cookies for proxy auth/session (browser + server calls that use this helper)
  const credentials = (init as any)?.credentials ?? "include";

  return {
    ...(init || {}),
    credentials,
    headers,
  };
}

async function apiFetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const finalInit = await withUserIdHeaders({
    credentials: "include",
    cache: "no-store",
    ...(init || {}),
  });
  return await fetchJsonWithRetry<T>(url, finalInit);
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
  calls?: T[]; // server may send "calls"; we normalize to items
  nextCursor: string | null;
};

export type PinRow = any;

export type ScoreHistoryItem = {
  score: number; // unified field used by sparkline
  created_at: string; // ISO
  rubric?: string | null; // optional
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
  const finalInit = await withUserIdHeaders({
    credentials: "include",
    cache: "no-store",
    ...(init || {}),
  });

  const r = await fetchJsonWithRetry<any>(url, finalInit);
  if (!r?.ok) throw new Error(r?.error || `HTTP error for ${url}`);
  return r as T;
}

export async function getAdminConfig(): Promise<AdminConfig> {
  const j = await jfetch<{ ok: true; config: AdminConfig }>(`${PROXY}/v1/admin/config`);
  return j.config;
}

export async function patchAdminConfig(
  patch: Partial<Pick<AdminConfig, "streak_threshold" | "xp_multiplier" | "comeback_bonus">>
): Promise<AdminConfig> {
  const j = await jfetch<{ ok: true; config: AdminConfig }>(`${PROXY}/v1/admin/config`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return j.config;
}

// -------------------------------
// Admin: Rep management
// -------------------------------

export type AdminRepRow = {
  id: string;
  name: string | null;
  tier: string | null;
  xp: number | null;
  created_at?: string | null;
};

export async function listAdminReps(): Promise<{ ok: true; reps: AdminRepRow[] }> {
  const url = `${PROXY}/v1/admin/reps`;
  return await jfetch<{ ok: true; reps: AdminRepRow[] }>(url, { method: "GET" });
}

export async function patchAdminRepTier(
  repId: string,
  tier: "SalesRep" | "TeamLead" | "Manager" | "Owner"
): Promise<{ ok: true; rep: AdminRepRow }> {
  const url = `${PROXY}/v1/admin/reps/${encodeURIComponent(repId)}`;
  return await jfetch<{ ok: true; rep: AdminRepRow }>(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tier }),
  });
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
  const j = await jfetch<{ ok: true; items?: any[]; calls?: any[] }>(`${PROXY}/v1/calls?limit=${limit}`);
  return { calls: j.calls || j.items || [] };
}

/** Cursor-based page for Recent Calls (+ optional search q) */
export async function getCallsPage(limit = 10, cursor?: string | null, q?: string) {
  const qs = new URLSearchParams();
  qs.set("limit", String(limit));
  if (cursor) qs.set("cursor", cursor);
  if (q) qs.set("q", q);

  const j = await jfetch<CallsPageResp>(`${PROXY}/v1/calls/paged?${qs.toString()}`);

  // normalize shape
  return {
    ok: true,
    items: j.items || j.calls || [],
    nextCursor: j.nextCursor ?? null,
  } as CallsPageResp;
}

/** Manually set score (admin / debug) */
export async function setScore(callId: string, score: number, rubric?: any) {
  const j = await jfetch<{ ok: true; call: any }>(`${PROXY}/v1/calls/${encodeURIComponent(callId)}/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ score_overall: score, rubric }),
  });
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
  const j = await jfetch<{ ok: true; callId: string; jobId: string }>(`${PROXY}/v1/upload/finalize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return j;
}

// -------------------------------
// Pins
// -------------------------------

export async function listPins(callId: string): Promise<{ pins: PinRow[] }> {
  const j = await jfetch<{ ok: true; pins: PinRow[] }>(`${PROXY}/v1/pins?callId=${encodeURIComponent(callId)}`);
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
  await jfetch<{ ok: true }>(`${PROXY}/v1/pins/${encodeURIComponent(pinId)}`, { method: "DELETE" });
  return true;
}

// -------------------------------
// Score history (for sparkline)
// -------------------------------

export async function getScoreHistory(callId: string, limit = 24): Promise<ScoreHistoryItem[]> {
  const j = await jfetch<{ ok: true; items: any[] }>(`${PROXY}/v1/calls/${encodeURIComponent(callId)}/scores?limit=${limit}`);

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
  const r = await jfetch<{ ok: true; items: ContactHit[] }>(`${PROXY}/v1/crm/contacts?${qs.toString()}`);
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
  const j = await jfetch<{ ok: true; job: any }>(`${PROXY}/v1/calls/${encodeURIComponent(callId)}/jobs/latest`);
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

export async function getSparringSessionsByRep(repId: string, limit: number = 5): Promise<SparringSessionSummary[]> {
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
    const msg = (res && (res as any).error) || "Failed to load sparring sessions";
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
    const msg = (res && (res as any).error) || "Failed to score sparring session";
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
  const res = await apiFetchJson<{ ok: boolean; session: any }>(`${PROXY}/v1/sparring/log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res || (res as any).ok === false) {
    const msg = (res && (res as any).error) || "Failed to log sparring session";
    throw new Error(msg);
  }

  return res.session;
}

// ------------------------------
// Minimal helpers for admin pages
// ------------------------------

type ApiJson = Record<string, any>;

function normaliseProxyPath(path: string) {
  // Accept "/v1/..." or "v1/..." etc
  if (!path.startsWith("/")) path = `/${path}`;
  return path.startsWith("/v1") ? path : `/v1${path}`;
}

export async function apiGet<T = ApiJson>(path: string, init: RequestInit = {}) {
  const urlPath = normaliseProxyPath(path);

  const finalInit = await withUserIdHeaders({
    ...init,
    method: "GET",
    credentials: "include",
    cache: init.cache ?? "no-store",
  });

  const json = await fetchJsonWithRetry<any>(`/api/proxy${urlPath}`, finalInit);

  if (!json?.ok) {
    throw new Error(json?.error || json?.message || "request_failed");
  }

  return json as T;
}

export async function apiPost<T = ApiJson>(path: string, body: any, init: RequestInit = {}) {
  const urlPath = normaliseProxyPath(path);

  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const finalInit = await withUserIdHeaders({
    ...init,
    method: "POST",
    credentials: "include",
    cache: init.cache ?? "no-store",
    headers,
    body: JSON.stringify(body ?? {}),
  });

  const json = await fetchJsonWithRetry<any>(`/api/proxy${urlPath}`, finalInit);

  if (!json?.ok) {
    throw new Error(json?.error || json?.message || "request_failed");
  }

  return json as T;
}

// ------------------------------
// Convenience proxy helpers (safe to use from pages)
// ------------------------------

/**
 * Fetch against the Next proxy using the same auth/header injection as apiGet/apiPost.
 * Accepts either "/v1/..." or "v1/..." or "/..." paths.
 */
export async function proxyFetch(path: string, init: RequestInit = {}) {
  // Allow callers to pass full proxy URLs too (e.g. "/api/proxy/v1/...")
  if (path.startsWith("/api/proxy")) {
    return fetchWithProxyAuth(path, init);
  }

  const urlPath = normaliseProxyPath(path);

  const finalInit = await withUserIdHeaders({
    ...init,
    credentials: (init as any)?.credentials ?? "include",
    cache: init.cache ?? "no-store",
  });

  return fetchWithProxyAuth(`/api/proxy${urlPath}`, finalInit);
}

export async function proxyGet<T = ApiJson>(path: string, init: RequestInit = {}) {
  const r = await proxyFetch(path, { ...init, method: "GET" });
  const json = (await r.json().catch(() => null)) as any;
  if (!r.ok || !json?.ok) {
    throw new Error(json?.error || json?.message || `request_failed_${r.status}`);
  }
  return json as T;
}

export async function proxyPost<T = ApiJson>(path: string, body: any, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const r = await proxyFetch(path, {
    ...init,
    method: "POST",
    headers,
    body: JSON.stringify(body ?? {}),
  });

  const json = (await r.json().catch(() => null)) as any;
  if (!r.ok || !json?.ok) {
    throw new Error(json?.error || json?.message || `request_failed_${r.status}`);
  }
  return json as T;
}

// ------------------------------
// Proxy fetch wrapper (THE ONLY allowed way to call the proxy)
// ------------------------------

function isProxyUrl(u: string) {
  return u.startsWith("/api/proxy/") || u === "/api/proxy" || u.startsWith("/api/proxy?");
}

async function fetchWithProxyAuth(url: string, init: RequestInit = {}) {
  // Non-proxy call: just pass through
  if (!isProxyUrl(url)) {
    return fetch(url, init);
  }

  const finalInit = await withUserIdHeaders({
    ...init,
    credentials: (init as any)?.credentials ?? "include",
    cache: init.cache ?? "no-store",
  });

  return fetch(url, finalInit);
}

async function fetchProxy(path: string, init: RequestInit = {}) {
  const urlPath = normaliseProxyPath(path);
  return fetchWithProxyAuth(`/api/proxy${urlPath}`, init);
}

// Guardrail:
// - Do NOT export fetchProxy / fetchWithProxyAuth
// - All callers must use proxyFetch / proxyGet / proxyPost