// Intelligence Layer — Day 227: Scorecard Studio mutation client.
//
// The typed write-side of Scorecard Studio, kept OUT of ScorecardsTab.tsx on
// purpose: the Day 225/226 validators pin that file as read-only (its only
// endpoints are the list + detail GETs), so every mutating call lives here and
// is rendered through ScorecardStudioEditor.tsx. All requests go through
// proxyFetch — no direct backend calls.
//
// Contract mirrors api src/routes/intelligenceScorecards.ts (Days 219B–220):
//   POST /v1/intelligence/scorecards                          create draft card
//   PUT  /v1/intelligence/scorecards/:id                      name/description/default
//   PUT  /v1/intelligence/scorecards/:id/versions/:versionId  save DRAFT rows
//   POST /v1/intelligence/scorecards/:id/versions/:vId/fork   locked → new draft
//   POST /v1/intelligence/scorecards/:id/activate             explicit, confirmed
//   POST /v1/intelligence/scorecards/:id/archive              marks, never deletes
//
// Safety rules encoded here rather than left to callers:
// - replace_conflicts is only ever attached when the caller passes the literal
//   `replace_conflicts: true` — it is never defaulted, so a plain activation
//   can never silently supersede another scorecard's live version;
// - the version PUT only makes sense for draft versions (the API answers 409
//   version_immutable otherwise) — the editor guards this before calling.

import { proxyFetch } from "@/lib/api";
import { SCORECARD_STAGES, type ScorecardStage } from "@/lib/scorecardReadiness";

/* ------------------------------ Constants ------------------------------ */
// Fixed vocabularies from api src/lib/scorecardStudio.ts. The four stages are
// the product's fixed frame — this MVP deliberately has no custom stages.

export const SCORECARD_CALL_TYPES = [
  "outbound_cold",
  "inbound_enquiry",
  "discovery",
  "demo",
  "objection_heavy",
  "renewal_upsell",
] as const;

export const CRITERION_EMPHASIS = ["minor", "standard", "major"] as const;
export type CriterionEmphasis = (typeof CRITERION_EMPHASIS)[number];

export const MAX_CRITERIA_PER_STAGE = 12;
export const MAX_NAME_CHARS = 120;
export const MAX_TEXT_CHARS = 2000;

/* ------------------------------ Edit state ----------------------------- */

export type EditableCriterion = {
  /** Local list key only — never sent to the API and never displayed. */
  key: string;
  label: string;
  description: string;
  scoring_guidance: string;
  good_example: string;
  weak_example: string;
  coaching_prompt: string;
  pass_fail: boolean;
  critical: boolean;
  emphasis: CriterionEmphasis;
};

export type EditableStage = {
  weight: number;
  guidance: string;
  criteria: EditableCriterion[];
};

export type EditableVersionState = {
  call_types: string[];
  stages: Record<ScorecardStage, EditableStage>;
};

let keySeq = 0;
export function nextCriterionKey(): string {
  keySeq += 1;
  return `crit-${Date.now()}-${keySeq}`;
}

export function blankCriterion(): EditableCriterion {
  return {
    key: nextCriterionKey(),
    label: "",
    description: "",
    scoring_guidance: "",
    good_example: "",
    weak_example: "",
    coaching_prompt: "",
    pass_fail: false,
    critical: false,
    emphasis: "standard",
  };
}

type VersionLike = {
  call_types?: string[] | null;
  stage_weights?: { stage: string; weight: number; guidance: string | null }[];
  criteria?: {
    stage: string;
    label: string;
    description: string | null;
    scoring_guidance: string | null;
    good_example?: string | null;
    weak_example?: string | null;
    coaching_prompt?: string | null;
    pass_fail: boolean;
    critical: boolean;
    emphasis: string;
    sort_order?: number;
  }[];
};

/** Build the editor's working state from a GET /scorecards/:id version. */
export function editableFromVersion(version: VersionLike): EditableVersionState {
  const stages = {} as Record<ScorecardStage, EditableStage>;
  for (const stage of SCORECARD_STAGES) {
    const weightRow = (version.stage_weights ?? []).find((w) => w.stage === stage);
    const rows = (version.criteria ?? [])
      .filter((c) => c.stage === stage)
      .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));
    stages[stage] = {
      weight: clampWeight(weightRow?.weight ?? 0),
      guidance: weightRow?.guidance ?? "",
      criteria: rows.map((c) => ({
        key: nextCriterionKey(),
        label: c.label ?? "",
        description: c.description ?? "",
        scoring_guidance: c.scoring_guidance ?? "",
        good_example: c.good_example ?? "",
        weak_example: c.weak_example ?? "",
        coaching_prompt: c.coaching_prompt ?? "",
        pass_fail: Boolean(c.pass_fail),
        // The API rejects critical without pass/fail; never import a state
        // the editor could not have produced.
        critical: Boolean(c.critical) && Boolean(c.pass_fail),
        emphasis: (CRITERION_EMPHASIS as readonly string[]).includes(c.emphasis)
          ? (c.emphasis as CriterionEmphasis)
          : "standard",
      })),
    };
  }
  return { call_types: [...(version.call_types ?? [])], stages };
}

export function clampWeight(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

export function weightTotal(state: EditableVersionState): number {
  return SCORECARD_STAGES.reduce((sum, s) => sum + clampWeight(state.stages[s].weight), 0);
}

function textOrNull(value: string): string | null {
  const s = value.trim();
  return s ? s.slice(0, MAX_TEXT_CHARS) : null;
}

/** Serialise editor state into the PUT /versions/:versionId payload. */
export function versionPayload(state: EditableVersionState): Record<string, unknown> {
  const stages: Record<string, unknown> = {};
  for (const stage of SCORECARD_STAGES) {
    const s = state.stages[stage];
    stages[stage] = {
      weight: clampWeight(s.weight),
      guidance: textOrNull(s.guidance),
      criteria: s.criteria.map((c) => ({
        label: c.label.trim().slice(0, MAX_NAME_CHARS),
        description: textOrNull(c.description),
        scoring_guidance: textOrNull(c.scoring_guidance),
        good_example: textOrNull(c.good_example),
        weak_example: textOrNull(c.weak_example),
        coaching_prompt: textOrNull(c.coaching_prompt),
        pass_fail: c.pass_fail,
        critical: c.pass_fail ? c.critical : false,
        emphasis: c.emphasis,
        // sort_order is the array position — reordering in the editor IS the
        // sort order.
      })),
    };
  }
  return { call_types: state.call_types, stages };
}

/* ------------------------------ API calls ------------------------------ */

export type ScorecardConflict = {
  reason: "call_type" | "company_default";
  version_id: string;
  scorecard_id: string;
  version: number;
  call_types: string[];
};

export type StudioResult<T> =
  | ({ ok: true } & T)
  | {
      ok: false;
      status: number;
      error: string;
      errors?: { error: string; detail?: string }[];
      conflicts?: ScorecardConflict[];
      draft_version_id?: string;
    };

async function studioRequest<T>(
  path: string,
  init: RequestInit
): Promise<StudioResult<T>> {
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
        errors: Array.isArray(json?.errors) ? json.errors : undefined,
        conflicts: Array.isArray(json?.conflicts) ? json.conflicts : undefined,
        draft_version_id: json?.draft_version_id ? String(json.draft_version_id) : undefined,
      };
    }
    return { ok: true, ...(json as T) };
  } catch {
    return { ok: false, status: 0, error: "network_error" };
  }
}

export function createScorecard(input: {
  name: string;
  description?: string;
  is_company_default?: boolean;
}) {
  return studioRequest<{ scorecard: { id: string; name: string }; draft_version: { id: string } }>(
    `/v1/intelligence/scorecards`,
    { method: "POST", body: JSON.stringify(input) }
  );
}

export function updateScorecardMeta(
  scorecardId: string,
  patch: { name?: string; description?: string | null; is_company_default?: boolean }
) {
  return studioRequest<{ scorecard: { id: string } }>(
    `/v1/intelligence/scorecards/${scorecardId}`,
    { method: "PUT", body: JSON.stringify(patch) }
  );
}

export function saveDraftVersion(
  scorecardId: string,
  versionId: string,
  state: EditableVersionState
) {
  return studioRequest<{ version: { id: string } }>(
    `/v1/intelligence/scorecards/${scorecardId}/versions/${versionId}`,
    { method: "PUT", body: JSON.stringify(versionPayload(state)) }
  );
}

export function forkVersion(scorecardId: string, versionId: string) {
  return studioRequest<{ version: { id: string } }>(
    `/v1/intelligence/scorecards/${scorecardId}/versions/${versionId}/fork`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

export function activateScorecard(
  scorecardId: string,
  opts: { activation_note?: string; replace_conflicts?: boolean } = {}
) {
  const body: Record<string, unknown> = {};
  const note = opts.activation_note?.trim();
  if (note) body.activation_note = note.slice(0, MAX_TEXT_CHARS);
  // Never defaulted, never inferred: the flag that supersedes other live
  // scorecards is only sent when the caller passed the literal `true` —
  // the editor only does that after its second, explicit confirmation.
  if (opts.replace_conflicts === true) body.replace_conflicts = true;
  return studioRequest<{ version: { id: string; version: number }; replaced: ScorecardConflict[] }>(
    `/v1/intelligence/scorecards/${scorecardId}/activate`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export function archiveScorecard(scorecardId: string) {
  return studioRequest<{ scorecard: { id: string } }>(
    `/v1/intelligence/scorecards/${scorecardId}/archive`,
    { method: "POST", body: JSON.stringify({}) }
  );
}
