// Intelligence Layer — Day 226: scorecard activation readiness (display only).
//
// A pure mirror of the API's own activation gate (api src/lib/scorecardStudio.ts
// `validateForActivation`) so a manager can see whether a draft version WOULD
// activate, without this app ever calling POST /activate. Nothing here mutates
// anything; Day 226 ships no activation action (see PREMIUM_UX_AUDIT.md §Day 226).
//
// The rules are copied deliberately, not approximated — if they drift from the
// API the panel becomes a lie, so scripts/validate-scorecard-readiness-day-226.mts
// pins each one against the API's error codes.
//
// API rules (all four must hold for POST /activate to pass validation):
//   missing_stage_weights                 every stage carries a weight
//   weights_must_total_100                weights sum to exactly 100
//   at_least_one_criterion_required       >= 1 criterion on the version
//   call_type_or_company_default_required non-default cards need >= 1 call type

export const SCORECARD_STAGES = ["intro", "discovery", "objection", "close"] as const;
export type ScorecardStage = (typeof SCORECARD_STAGES)[number];

export type ReadinessInput = {
  weights: { stage: string; weight: number }[];
  criteriaCount: number;
  callTypes: string[];
  isCompanyDefault: boolean;
};

export type ReadinessCheck = {
  /** Matches the API error code this check mirrors, so the two can't drift silently. */
  id:
    | "missing_stage_weights"
    | "weights_must_total_100"
    | "at_least_one_criterion_required"
    | "call_type_or_company_default_required";
  label: string;
  ok: boolean;
  detail: string;
};

export type Readiness = {
  ready: boolean;
  checks: ReadinessCheck[];
  weightTotal: number;
};

export function computeReadiness(input: ReadinessInput): Readiness {
  const byStage = new Map(input.weights.map((w) => [w.stage, Number(w.weight) || 0]));
  const missing = SCORECARD_STAGES.filter((s) => !byStage.has(s));
  const weightTotal = input.weights.reduce((sum, w) => sum + (Number(w.weight) || 0), 0);

  const checks: ReadinessCheck[] = [
    {
      id: "missing_stage_weights",
      label: "Every stage has a weight",
      ok: missing.length === 0,
      detail: missing.length
        ? `Missing: ${missing.join(", ")}`
        : `All ${SCORECARD_STAGES.length} stages weighted`,
    },
    {
      // The API only checks the total once no stage is missing; mirror that so
      // an incomplete draft shows one root cause rather than two.
      id: "weights_must_total_100",
      label: "Weights total 100%",
      ok: missing.length === 0 && weightTotal === 100,
      detail: missing.length ? "Waiting on stage weights" : `Currently ${weightTotal}%`,
    },
    {
      id: "at_least_one_criterion_required",
      label: "At least one criterion",
      ok: input.criteriaCount >= 1,
      detail:
        input.criteriaCount >= 1
          ? `${input.criteriaCount} criteria defined`
          : "No criteria defined yet",
    },
    {
      id: "call_type_or_company_default_required",
      label: "Applies to something",
      ok: input.isCompanyDefault || input.callTypes.length > 0,
      detail: input.isCompanyDefault
        ? "Company default — applies to every call type"
        : input.callTypes.length > 0
        ? `${input.callTypes.length} call type${input.callTypes.length === 1 ? "" : "s"} selected`
        : "Needs a call type, or must be the company default",
    },
  ];

  return { ready: checks.every((c) => c.ok), checks, weightTotal };
}

/* ------------------------------ Conflicts ------------------------------ */
// Mirrors the API's conflict rules (one active version per call type across the
// company; one active company default). Computed from the company-wide list the
// Scorecards tab already holds, so it is accurate for that data — but it is a
// PREVIEW of what the API would answer, never an authority. The API re-checks at
// activation time and answers 409, and conflicts are never replaced without an
// explicit replace_conflicts flag, which this app never sends.

export type ConflictPreview = {
  reason: "call_type" | "company_default";
  scorecardName: string;
  version: number;
  callTypes: string[];
};

export type ConflictCandidate = {
  scorecardId: string;
  scorecardName: string;
  isCompanyDefault: boolean;
  status: string;
  activeVersion: { version: number; call_types: string[] } | null;
};

export function previewConflicts(
  candidate: { scorecardId: string; isCompanyDefault: boolean; callTypes: string[] },
  others: ConflictCandidate[]
): ConflictPreview[] {
  const conflicts: ConflictPreview[] = [];
  const seen = new Set<string>();

  for (const other of others) {
    if (other.scorecardId === candidate.scorecardId) continue;
    if (!other.activeVersion) continue;

    const overlap = candidate.callTypes.filter((t) =>
      (other.activeVersion?.call_types ?? []).includes(t)
    );
    if (overlap.length) {
      conflicts.push({
        reason: "call_type",
        scorecardName: other.scorecardName,
        version: other.activeVersion.version,
        callTypes: overlap,
      });
      seen.add(other.scorecardId);
      continue;
    }

    if (candidate.isCompanyDefault && other.isCompanyDefault && other.status === "active") {
      if (seen.has(other.scorecardId)) continue;
      conflicts.push({
        reason: "company_default",
        scorecardName: other.scorecardName,
        version: other.activeVersion.version,
        callTypes: other.activeVersion.call_types ?? [],
      });
      seen.add(other.scorecardId);
    }
  }

  return conflicts;
}
