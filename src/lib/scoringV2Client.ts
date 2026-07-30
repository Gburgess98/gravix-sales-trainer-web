// Day 268 — Scoring v2 Call Review: safe optional-v2 parsing + display view-model.
//
// Mirrors the API Scoring Output Contract v2 (Day 264) and the Day-267 runtime
// (`API src/lib/scoringV2.ts`). Two hard rules, matching scoringProvenance.ts:
//   1. `analysis_json.v2` is OPTIONAL and UNTRUSTED. `getScoringV2` returns null
//      for anything that is not a well-formed v2 object, so the page falls back
//      to the existing v1 rendering instead of crashing or showing empty panels.
//   2. Pure and defensive — no React, no throw. Every field is read through a
//      guard. This module builds a display-ready VIEW MODEL; the components are
//      thin renderers of it, so the whole surface is testable under Node's native
//      type stripping (no test runner) — see
//      scripts/validate-scoring-v2-call-review-day-268.mts.
//
// UK spelling.

export const V2_STAGES = ["intro", "discovery", "objection", "close"] as const;
export type StageV2 = (typeof V2_STAGES)[number];
export const V2_STATUSES = ["pass", "partial", "fail", "not_observed"] as const;
export type CriterionStatus = (typeof V2_STATUSES)[number];
export type ObjectionHandled = "handled" | "partially" | "missed";

export interface EvidenceQuote {
  quote: string;
  start_sec: number | null;
  end_sec: number | null;
  segment_index: number | null;
  speaker: string | null;
}

export interface CriterionResult {
  criterion_id: string;
  label: string;
  stage: StageV2;
  score: number | null;
  status: CriterionStatus;
  weight: number;
  emphasis: string;
  pass_fail: boolean;
  critical: boolean;
  evidence: EvidenceQuote[];
  why_points_lost: string | null;
  points_lost: number | null;
  coaching_action: string | null;
  suggested_drill: { key: string | null; title: string | null } | null;
}

export interface StageResultV2 {
  stage: StageV2;
  score: number | null;
  weight: number;
  status: CriterionStatus;
  notes: string;
  criteria: CriterionResult[];
}

export interface ObjectionMatch {
  detected_text: string;
  objection_item_id: string | null;
  objection_item_key: string | null;
  objection_label: string | null;
  category: string | null;
  handled: ObjectionHandled | null;
  evidence: EvidenceQuote | null;
}

export interface Confidence {
  level: "low" | "medium" | "high";
  value: number;
}

export interface ScoreV2Provenance {
  scoring_provider?: string | null;
  scoring_model?: string | null;
  scorecard_source?: string | null;
  scorecard_id?: string | null;
  scorecard_version_id?: string | null;
  scorecard_version?: number | null;
  scorecard_name?: string | null;
  context_version?: number | null;
  prompt_version?: string | null;
  rubric_version?: string | null;
  cache_key_version?: string | null;
  criteria_version?: string | null;
}

export interface ScoreV2 {
  contract_version: "v2";
  overall_score: number;
  summary: string;
  stages: StageResultV2[];
  objection_matches: ObjectionMatch[];
  confidence: Confidence;
  degraded_score: boolean;
  degraded_reason: string | null;
  voice?: unknown;
  provenance: ScoreV2Provenance;
  trend_delta?: number;
}

// ── guards ────────────────────────────────────────────────────────────────────
function isObj(x: unknown): x is Record<string, any> {
  return !!x && typeof x === "object" && !Array.isArray(x);
}
function str(x: unknown): string {
  return typeof x === "string" ? x : "";
}
function numOrNull(x: unknown): number | null {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

function normaliseEvidence(raw: any): EvidenceQuote | null {
  if (!isObj(raw)) return null;
  const quote = str(raw.quote);
  if (!quote) return null;
  return {
    quote,
    start_sec: numOrNull(raw.start_sec),
    end_sec: numOrNull(raw.end_sec),
    segment_index: numOrNull(raw.segment_index),
    speaker: str(raw.speaker) || null,
  };
}

/**
 * Parse `analysis_json.v2` into a ScoreV2, or return null so the caller renders
 * v1. Returns null for: missing v2, wrong contract version, missing/duplicated
 * stages, stages in the wrong order, malformed criteria, invalid statuses, and
 * unusable score fields (observed with no numeric score, or not_observed with a
 * numeric score). Optional fields degrade gracefully; they never null the whole
 * object.
 */
export function getScoringV2(analysisJson: unknown): ScoreV2 | null {
  if (!isObj(analysisJson)) return null;
  const v2 = analysisJson.v2;
  if (!isObj(v2)) return null;
  if (v2.contract_version !== "v2") return null;

  const rawStages = v2.stages;
  if (!Array.isArray(rawStages) || rawStages.length !== V2_STAGES.length) return null;

  const stages: StageResultV2[] = [];
  for (let i = 0; i < V2_STAGES.length; i += 1) {
    const s = rawStages[i];
    if (!isObj(s)) return null;
    if (s.stage !== V2_STAGES[i]) return null; // wrong order / duplicate / missing

    const rawCriteria = s.criteria;
    if (!Array.isArray(rawCriteria)) return null;
    const criteria: CriterionResult[] = [];
    for (const c of rawCriteria) {
      if (!isObj(c)) return null;
      const criterion_id = str(c.criterion_id);
      if (!criterion_id) return null;
      if (!(V2_STATUSES as readonly string[]).includes(c.status)) return null;
      const status = c.status as CriterionStatus;
      const score = numOrNull(c.score);
      if (status === "not_observed") {
        if (c.score != null && score === null) return null; // e.g. a string score
        if (score !== null) return null; // not_observed must not carry a score
      } else if (score === null) {
        return null; // observed criterion must have a numeric score
      }
      const evidence = Array.isArray(c.evidence)
        ? (c.evidence.map(normaliseEvidence).filter(Boolean) as EvidenceQuote[])
        : [];
      const drill = isObj(c.suggested_drill)
        ? { key: str(c.suggested_drill.key) || null, title: str(c.suggested_drill.title) || null }
        : null;
      criteria.push({
        criterion_id,
        label: str(c.label) || criterion_id,
        stage: V2_STAGES[i],
        score,
        status,
        weight: numOrNull(c.weight) ?? 0,
        emphasis: str(c.emphasis) || "standard",
        pass_fail: Boolean(c.pass_fail),
        critical: Boolean(c.critical),
        evidence,
        why_points_lost: str(c.why_points_lost) || null,
        points_lost: numOrNull(c.points_lost),
        coaching_action: str(c.coaching_action) || null,
        suggested_drill: drill && (drill.key || drill.title) ? drill : null,
      });
    }

    const stageStatus = (V2_STATUSES as readonly string[]).includes(s.status)
      ? (s.status as CriterionStatus)
      : "not_observed";
    stages.push({
      stage: V2_STAGES[i],
      score: numOrNull(s.score),
      weight: numOrNull(s.weight) ?? 0,
      status: stageStatus,
      notes: str(s.notes),
      criteria,
    });
  }

  const objection_matches = Array.isArray(v2.objection_matches)
    ? (v2.objection_matches
        .map((o: any): ObjectionMatch | null => {
          if (!isObj(o)) return null;
          const detected_text = str(o.detected_text);
          if (!detected_text) return null;
          const handled = (["handled", "partially", "missed"] as const).includes(o.handled)
            ? (o.handled as ObjectionHandled)
            : null;
          return {
            detected_text,
            objection_item_id: str(o.objection_item_id) || null,
            objection_item_key: str(o.objection_item_key) || null,
            objection_label: str(o.objection_label) || null,
            category: str(o.category) || null,
            handled,
            evidence: o.evidence ? normaliseEvidence(o.evidence) : null,
          };
        })
        .filter(Boolean) as ObjectionMatch[])
    : [];

  const confRaw = isObj(v2.confidence) ? v2.confidence : {};
  const confValue = numOrNull(confRaw.value);
  const confidence: Confidence = {
    level: (["low", "medium", "high"] as const).includes(confRaw.level) ? confRaw.level : "low",
    value: confValue ?? 0,
  };

  return {
    contract_version: "v2",
    overall_score: numOrNull(v2.overall_score) ?? 0,
    summary: str(v2.summary),
    stages,
    objection_matches,
    confidence,
    degraded_score: Boolean(v2.degraded_score),
    degraded_reason: str(v2.degraded_reason) || null,
    voice: v2.voice,
    provenance: isObj(v2.provenance) ? (v2.provenance as ScoreV2Provenance) : {},
    trend_delta: numOrNull(v2.trend_delta) ?? undefined,
  };
}

// ── display copy ──────────────────────────────────────────────────────────────
export const V2_DEGRADED_LEAD = "Provisional score — this review used a limited scoring mode.";

/** Internal degraded-reason codes → calm, rep-facing copy. Raw codes are never
 * shown as the primary message. */
export const V2_DEGRADED_COPY: Record<string, string> = {
  stub_provider: "This review used a limited scoring mode — no live model was called.",
  heuristic_fallback: "This review used a fallback scorer rather than the full AI model.",
  no_transcript: "There wasn't enough transcript to score this call in full.",
  invalid_model_output: "The scorer's response couldn't be fully validated, so this score is provisional.",
  insufficient_evidence: "There wasn't enough evidence in the call to score every criterion.",
};

export function degradedReasonCopy(reason: string | null): string {
  if (reason && V2_DEGRADED_COPY[reason]) return V2_DEGRADED_COPY[reason];
  return "This score was produced in a limited mode and should be treated as provisional.";
}

export const V2_STATUS_LABEL: Record<CriterionStatus, string> = {
  pass: "Pass",
  partial: "Partial",
  fail: "Fail",
  not_observed: "Not observed",
};

/** Semantic status tone → design-token class group (never colour-only in the UI). */
export const V2_STATUS_TONE: Record<CriterionStatus, "success" | "warning" | "danger" | "neutral"> = {
  pass: "success",
  partial: "warning",
  fail: "danger",
  not_observed: "neutral",
};

// ── view model ────────────────────────────────────────────────────────────────
export interface EvidenceVM {
  quote: string;
  speaker: string | null;
  timestampLabel: string | null;
  /** Jump target: seek to a second, scroll to a transcript segment, or none. */
  jump: { kind: "seek"; seconds: number } | { kind: "segment"; index: number } | null;
}

export interface CriterionVM {
  id: string;
  label: string;
  status: CriterionStatus;
  statusLabel: string;
  statusTone: "success" | "warning" | "danger" | "neutral";
  observed: boolean;
  scoreDisplay: string; // "78 / 100" or "Not observed"
  weightLabel: string | null; // "Weight 30%"
  emphasisLabel: string | null; // "Critical" | "Major focus" | null
  evidence: EvidenceVM[];
  whyPointsLost: string | null;
  pointsLostLabel: string | null; // "8 points"
  coachingAction: string | null;
  drill: { key: string | null; title: string } | null;
}

export interface StageCriteriaVM {
  stage: StageV2;
  count: number;
  summary: string; // "2 pass · 1 partial · 1 not observed"
  criteria: CriterionVM[];
}

export interface ObjectionVM {
  detectedText: string;
  label: string | null;
  category: string | null;
  handledLabel: string;
  handledTone: "success" | "warning" | "danger" | "neutral";
  evidence: EvidenceVM | null;
  /** Objection Library href — present ONLY when a real objection_item_id exists. */
  href: string | null;
}

export interface BannerVM {
  degraded: boolean;
  lead: string;
  detail: string;
  confidenceLabel: string; // "Low confidence" etc. (empty when degraded)
  confidenceValue: string | null; // secondary numeric, e.g. "0.90"
}

export interface ProvenanceRowVM {
  label: string;
  value: string;
}

export interface ScoringV2ViewModel {
  overall: number;
  summary: string;
  banner: BannerVM;
  stagesByKey: Partial<Record<StageV2, StageCriteriaVM>>;
  objections: ObjectionVM[];
  provenanceRows: ProvenanceRowVM[];
}

function fmtTimestamp(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function emphasisLabel(c: CriterionResult): string | null {
  if (c.critical) return "Critical";
  const e = c.emphasis.toLowerCase();
  if (e === "high" || e === "major") return "Major focus";
  return null;
}

function evidenceVM(ev: EvidenceQuote): EvidenceVM {
  let jump: EvidenceVM["jump"] = null;
  let timestampLabel: string | null = null;
  if (ev.start_sec != null) {
    jump = { kind: "seek", seconds: ev.start_sec };
    timestampLabel = fmtTimestamp(ev.start_sec);
  } else if (ev.segment_index != null) {
    jump = { kind: "segment", index: ev.segment_index };
  }
  return { quote: ev.quote, speaker: ev.speaker, timestampLabel, jump };
}

function criterionVM(c: CriterionResult): CriterionVM {
  const observed = c.status !== "not_observed";
  return {
    id: c.criterion_id,
    label: c.label,
    status: c.status,
    statusLabel: V2_STATUS_LABEL[c.status],
    statusTone: V2_STATUS_TONE[c.status],
    observed,
    scoreDisplay: observed && c.score != null ? `${Math.round(c.score)} / 100` : "Not observed",
    weightLabel: c.weight > 0 ? `Weight ${Math.round(c.weight)}%` : null,
    emphasisLabel: emphasisLabel(c),
    // Evidence and point-loss are only meaningful for observed criteria.
    evidence: observed ? c.evidence.map(evidenceVM) : [],
    whyPointsLost: observed && (c.status === "partial" || c.status === "fail") ? c.why_points_lost : null,
    pointsLostLabel:
      observed && (c.status === "partial" || c.status === "fail") && c.points_lost != null
        ? `${Math.round(c.points_lost)} point${Math.round(c.points_lost) === 1 ? "" : "s"}`
        : null,
    coachingAction: c.coaching_action,
    drill: c.suggested_drill && c.suggested_drill.title ? { key: c.suggested_drill.key, title: c.suggested_drill.title } : null,
  };
}

function stageSummary(criteria: CriterionResult[]): string {
  const counts: Record<CriterionStatus, number> = { pass: 0, partial: 0, fail: 0, not_observed: 0 };
  for (const c of criteria) counts[c.status] += 1;
  const parts: string[] = [];
  if (counts.pass) parts.push(`${counts.pass} pass`);
  if (counts.partial) parts.push(`${counts.partial} partial`);
  if (counts.fail) parts.push(`${counts.fail} fail`);
  if (counts.not_observed) parts.push(`${counts.not_observed} not observed`);
  return parts.join(" · ");
}

const HANDLED_LABEL: Record<ObjectionHandled, string> = {
  handled: "Handled",
  partially: "Partially handled",
  missed: "Missed",
};
const HANDLED_TONE: Record<ObjectionHandled, "success" | "warning" | "danger" | "neutral"> = {
  handled: "success",
  partially: "warning",
  missed: "danger",
};

/** Objection Library link — only when a real objection_item_id exists. */
export function objectionLibraryHref(objection_item_id: string | null): string | null {
  return objection_item_id ? "/intelligence?tab=objections" : null;
}

/** Build the display view model. Pure — no recompute of scores in the browser. */
export function buildScoringV2ViewModel(v2: ScoreV2): ScoringV2ViewModel {
  const banner: BannerVM = v2.degraded_score
    ? { degraded: true, lead: V2_DEGRADED_LEAD, detail: degradedReasonCopy(v2.degraded_reason), confidenceLabel: "", confidenceValue: null }
    : {
        degraded: false,
        lead: "",
        detail: "",
        confidenceLabel: `${v2.confidence.level.charAt(0).toUpperCase()}${v2.confidence.level.slice(1)} confidence`,
        confidenceValue: v2.confidence.value > 0 ? v2.confidence.value.toFixed(2) : null,
      };

  const stagesByKey: Partial<Record<StageV2, StageCriteriaVM>> = {};
  for (const s of v2.stages) {
    if (s.criteria.length === 0) continue; // criteria only when they exist
    stagesByKey[s.stage] = {
      stage: s.stage,
      count: s.criteria.length,
      summary: stageSummary(s.criteria),
      criteria: s.criteria.map(criterionVM),
    };
  }

  const objections: ObjectionVM[] = v2.objection_matches.map((o) => ({
    detectedText: o.detected_text,
    label: o.objection_label,
    category: o.category,
    handledLabel: o.handled ? HANDLED_LABEL[o.handled] : "Detected",
    handledTone: o.handled ? HANDLED_TONE[o.handled] : "neutral",
    evidence: o.evidence ? evidenceVM(o.evidence) : null,
    href: objectionLibraryHref(o.objection_item_id),
  }));

  const p = v2.provenance;
  const rows: ProvenanceRowVM[] = [];
  const add = (label: string, value: unknown) => {
    const v = value == null || value === "" ? null : String(value);
    if (v) rows.push({ label, value: v });
  };
  add("Contract", v2.contract_version);
  add("Provider", p.scoring_provider);
  add("Model", p.scoring_model);
  add("Scorecard source", p.scorecard_source);
  add("Scorecard version", p.scorecard_version);
  add("Context version", p.context_version);
  add("Prompt version", p.prompt_version);
  add("Rubric version", p.rubric_version);
  add("Cache-key version", p.cache_key_version);
  add("Confidence", `${banner.confidenceLabel || v2.confidence.level}${banner.confidenceValue ? ` (${banner.confidenceValue})` : ""}`.trim());
  add("Degraded", v2.degraded_score ? `Yes — ${v2.degraded_reason ?? "provisional"}` : "No");

  return {
    overall: Math.round(v2.overall_score),
    summary: v2.summary,
    banner,
    stagesByKey,
    objections,
    provenanceRows: rows,
  };
}
