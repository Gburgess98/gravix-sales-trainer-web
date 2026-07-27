// Intelligence Layer — Day 250: Objection Library client.
//
// The third Intelligence pillar's read + write surface, mirroring the Day 227
// scorecardStudioApi shape: every request goes through proxyFetch — never a
// direct call to the API origin — and the contract tracks the Day 236 API in
// api src/routes/intelligenceObjections.ts:
//   GET    /v1/intelligence/objections            company items + categories
//   POST   /v1/intelligence/objections            create a draft (label only)
//   GET    /v1/intelligence/objections/:id         item + its evidence
//   PUT    /v1/intelligence/objections/:id         edit a DRAFT (partial)
//   POST   /v1/intelligence/objections/:id/approve completeness-gated
//   POST   /v1/intelligence/objections/:id/archive marks, never deletes
//   POST   /v1/intelligence/objections/:id/evidence manual link (call/phrase)
//
// Lifecycle: draft → approved → archived. Approved items are immutable
// (editing answers 409 immutable_approved); archived items are read-only
// history. There is no hard-delete endpoint and this client exposes none.

import { proxyFetch } from "@/lib/api";

/* ------------------------------ Vocabulary ------------------------------ */
// Fixed category set from api src/routes/intelligenceObjections.ts. The list
// endpoint also returns this as `categories`, but pinning it here lets the
// create form render before the first fetch resolves.

export const OBJECTION_CATEGORIES = [
  "price", "timing", "authority", "trust",
  "competitor", "fit", "logistics", "other",
] as const;

export type ObjectionCategory = (typeof OBJECTION_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<string, string> = {
  price: "Price",
  timing: "Timing",
  authority: "Authority",
  trust: "Trust",
  competitor: "Competitor",
  fit: "Fit",
  logistics: "Logistics",
  other: "Other",
};

export const OBJECTION_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  approved: "Approved",
  archived: "Archived",
};

export function categoryLabel(c: string | null | undefined): string {
  const key = String(c ?? "").trim();
  return CATEGORY_LABELS[key] ?? (key ? key.replace(/_/g, " ") : "Uncategorised");
}

export function objectionStatusLabel(s: string | null | undefined): string {
  const key = String(s ?? "").trim();
  return OBJECTION_STATUS_LABELS[key] ?? (key ? key.replace(/_/g, " ") : "—");
}

// Never let a UUID-shaped or empty value become a visible label
// (PREMIUM_UX_AUDIT §38, same rule as the scorecard/provenance helpers).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function objectionLabel(label: string | null | undefined): string {
  const s = String(label ?? "").trim();
  if (!s || UUID_RE.test(s)) return "Untitled objection";
  return s;
}

/* -------------------------------- Types --------------------------------- */

export type ObjectionItem = {
  id: string;
  label: string;
  category: string;
  status: string;
  buyer_phrases: string[];
  why_it_matters: string | null;
  approved_response: string | null;
  weak_response_patterns: string[];
  no_go_language: string[];
  coaching_note: string | null;
  linked_scorecard_criterion_id: string | null;
  linked_trigger_key: string | null;
  created_by: string | null;
  updated_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  archived_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ObjectionEvidence = {
  id: string;
  objection_id: string;
  call_id: string | null;
  rep_id: string | null;
  phrase: string | null;
  source: string;
  confidence: number | null;
  occurred_at: string | null;
  created_at: string | null;
};

/* ------------------------------ Readiness ------------------------------- */
// The SAME completeness gate the API enforces on approve (approvalErrors in
// api src/routes/intelligenceObjections.ts): label, a valid category, at least
// one buyer phrase, an approved response, and a coaching note or why-it-matters.
// Computed client-side so the manager sees what is missing BEFORE approving,
// never as a substitute for the server's own check.

export type ObjectionReadiness = {
  ready: boolean;
  missing: string[];
};

export const APPROVAL_REQUIREMENTS: { key: string; label: string }[] = [
  { key: "label", label: "A label" },
  { key: "category", label: "A category" },
  { key: "buyer_phrases", label: "At least one buyer phrase" },
  { key: "approved_response", label: "An approved response" },
  { key: "coaching", label: "A coaching note or why-it-matters" },
];

export function computeObjectionReadiness(item: {
  label?: string | null;
  category?: string | null;
  buyer_phrases?: string[] | null;
  approved_response?: string | null;
  coaching_note?: string | null;
  why_it_matters?: string | null;
}): ObjectionReadiness {
  const missing: string[] = [];
  if (!String(item.label ?? "").trim()) missing.push("A label");
  if (!(OBJECTION_CATEGORIES as readonly string[]).includes(String(item.category ?? ""))) {
    missing.push("A category");
  }
  if (!Array.isArray(item.buyer_phrases) || item.buyer_phrases.filter((p) => p.trim()).length === 0) {
    missing.push("At least one buyer phrase");
  }
  if (!String(item.approved_response ?? "").trim()) missing.push("An approved response");
  if (!String(item.coaching_note ?? "").trim() && !String(item.why_it_matters ?? "").trim()) {
    missing.push("A coaching note or why-it-matters");
  }
  return { ready: missing.length === 0, missing };
}

/* ----------------------- Assignment prefill (Day 254) ------------------- */
// Turn an approved objection into a coaching-assignment title + instructions,
// composed DETERMINISTICALLY from the objection's own approved fields — no
// generation, no external content. The assignment itself is created by the
// existing engine (assignCoachingFromObjection in @/lib/api); this only shapes
// the prefill a manager sees and can edit before submitting.

export function buildObjectionAssignmentPrefill(item: {
  label?: string | null;
  approved_response?: string | null;
  coaching_note?: string | null;
  buyer_phrases?: string[] | null;
  weak_response_patterns?: string[] | null;
  no_go_language?: string[] | null;
}): { title: string; notes: string } {
  const label = objectionLabel(item.label);
  const title = `Practise handling: ${label}`;

  const bullets = (list: string[] | null | undefined) =>
    (Array.isArray(list) ? list : []).map((s) => `• ${s}`).filter((s) => s.length > 2);

  const blocks: string[] = [];
  const approved = String(item.approved_response ?? "").trim();
  if (approved) blocks.push(`Approved response:\n${approved}`);
  const coaching = String(item.coaching_note ?? "").trim();
  if (coaching) blocks.push(`Coaching note:\n${coaching}`);
  const phrases = bullets(item.buyer_phrases);
  if (phrases.length) blocks.push(`What the buyer might say:\n${phrases.join("\n")}`);
  const weak = bullets(item.weak_response_patterns);
  if (weak.length) blocks.push(`Responses to avoid:\n${weak.join("\n")}`);
  const nogo = bullets(item.no_go_language);
  if (nogo.length) blocks.push(`Never say:\n${nogo.join("\n")}`);

  return { title, notes: blocks.join("\n\n") };
}

/* --------------------------- List-field helpers ------------------------- */
// text[] fields are edited as one-item-per-line textareas. Normalise on the
// way in and out so the manager never wrestles with array syntax.

export function linesToList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function listToLines(list: string[] | null | undefined): string {
  return Array.isArray(list) ? list.join("\n") : "";
}

/* ------------------------------ Requests -------------------------------- */

export type ObjectionResult<T> =
  | ({ ok: true } & T)
  | {
      ok: false;
      status: number;
      error: string;
      field?: string;
      errors?: { error: string; field?: string }[];
    };

async function objectionRequest<T>(path: string, init: RequestInit): Promise<ObjectionResult<T>> {
  try {
    const res = await proxyFetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    if (!res.ok || json?.ok !== true) {
      return {
        ok: false,
        status: res.status,
        error: String(json?.error ?? "request_failed"),
        field: json?.field ? String(json.field) : undefined,
        errors: Array.isArray(json?.errors) ? json.errors : undefined,
      };
    }
    return { ok: true, ...(json as T) };
  } catch {
    return { ok: false, status: 0, error: "network_error" };
  }
}

export function listObjections() {
  return objectionRequest<{ company_id: string; items: ObjectionItem[]; categories: string[] }>(
    `/v1/intelligence/objections`,
    { method: "GET", cache: "no-store" }
  );
}

export function getObjection(id: string) {
  return objectionRequest<{ item: ObjectionItem; evidence: ObjectionEvidence[] }>(
    `/v1/intelligence/objections/${id}`,
    { method: "GET", cache: "no-store" }
  );
}

// The write payload. Only defined keys are sent, so a PUT stays a partial
// update — mirroring the API's parsePatch.
export type ObjectionPatch = {
  label?: string;
  category?: string;
  buyer_phrases?: string[];
  why_it_matters?: string | null;
  approved_response?: string | null;
  weak_response_patterns?: string[];
  no_go_language?: string[];
  coaching_note?: string | null;
  linked_scorecard_criterion_id?: string | null;
  linked_trigger_key?: string | null;
};

export function createObjection(patch: ObjectionPatch) {
  return objectionRequest<{ item: ObjectionItem }>(`/v1/intelligence/objections`, {
    method: "POST",
    body: JSON.stringify(patch),
  });
}

export function updateObjection(id: string, patch: ObjectionPatch) {
  return objectionRequest<{ item: ObjectionItem }>(`/v1/intelligence/objections/${id}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

export function approveObjection(id: string) {
  return objectionRequest<{ item: ObjectionItem }>(`/v1/intelligence/objections/${id}/approve`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function archiveObjection(id: string) {
  return objectionRequest<{ item: ObjectionItem }>(`/v1/intelligence/objections/${id}/archive`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

// Manual evidence: a call and/or a quoted phrase. Suggestion-sourced evidence
// is a later lane — this endpoint always records source "manual".
export function addObjectionEvidence(id: string, input: { call_id?: string; phrase?: string; occurred_at?: string }) {
  return objectionRequest<{ evidence: ObjectionEvidence }>(
    `/v1/intelligence/objections/${id}/evidence`,
    { method: "POST", body: JSON.stringify(input) }
  );
}
