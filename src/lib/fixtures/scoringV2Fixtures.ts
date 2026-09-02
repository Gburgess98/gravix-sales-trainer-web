// Day 268 — DETERMINISTIC, TEST-ONLY fixtures for the Scoring v2 Call Review UI.
//
// NOT real customer calls, NOT an LLM output, NOT a production DB seed. These are
// hand-authored `analysis_json`-shaped objects used by the Day-268 validator and
// the dev preview route (/dev/scoring-v2-preview) only. They live outside every
// production data path. Terminology/shape follow Days 265–267.
//
// Each fixture is what `callMeta.analysis_json` would look like: a v1 top-level
// projection (stages/moments/summary) PLUS an optional `.v2` object. A v1-only
// fixture has no `.v2`; a malformed fixture has a broken `.v2` that must fall
// back to v1. UK spelling.

/* eslint-disable @typescript-eslint/no-explicit-any */

const SEGMENTS = [
  { idx: 0, speaker: "rep", start_sec: 0, end_sec: 8, text: "Thanks for the time — I want to keep this to fifteen minutes and agree a next step if it's a fit." },
  { idx: 1, speaker: "buyer", start_sec: 8, end_sec: 14, text: "Sure, that works. We review calls manually at the moment." },
  { idx: 2, speaker: "rep", start_sec: 14, end_sec: 22, text: "We work with twelve combat-sports gyms on exactly this, so I've seen how messy call reviews get at scale." },
  { idx: 3, speaker: "buyer", start_sec: 22, end_sec: 30, text: "Honestly it feels expensive for what it is." },
  { idx: 4, speaker: "rep", start_sec: 30, end_sec: 40, text: "Totally fair — most teams find the time saved on reviews pays it back inside a quarter." },
  { idx: 5, speaker: "buyer", start_sec: 40, end_sec: 46, text: "I'd need to speak with my partner before deciding." },
  { idx: 6, speaker: "rep", start_sec: 46, end_sec: 54, text: "Makes sense. Shall we get a short call with both of you in the diary for Thursday?" },
];

const STAGE_LABEL: Record<string, string> = {
  intro: "Set agenda and establish credibility",
  discovery: "Uncover pain, current process and decision route",
  objection: "Isolate the objection and reframe value",
  close: "Secure clear next step and commitment",
};
const STAGE_WEIGHT: Record<string, number> = { intro: 20, discovery: 30, objection: 30, close: 20 };

function ev(segIdx: number, quote: string, withTimestamp = true) {
  const seg = SEGMENTS[segIdx];
  return {
    quote,
    start_sec: withTimestamp ? seg.start_sec : null,
    end_sec: withTimestamp ? seg.end_sec : null,
    segment_index: segIdx,
    speaker: seg.speaker,
  };
}

interface CritOpts {
  status: string;
  score: number | null;
  evidence?: any[];
  why?: string | null;
  pointsLost?: number | null;
  coaching?: string | null;
  drill?: { key: string; title: string } | null;
  emphasis?: string;
  critical?: boolean;
}
function crit(stage: string, o: CritOpts) {
  return {
    criterion_id: `scv-fixture-001:${stage}:${STAGE_LABEL[stage].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    label: STAGE_LABEL[stage],
    stage,
    score: o.score,
    status: o.status,
    weight: 100,
    emphasis: o.emphasis ?? (stage === "intro" ? "standard" : "high"),
    pass_fail: false,
    critical: o.critical ?? false,
    evidence: o.evidence ?? [],
    why_points_lost: o.why ?? null,
    points_lost: o.pointsLost ?? null,
    coaching_action: o.coaching ?? null,
    suggested_drill: o.drill ?? null,
  };
}
function stage(stageKey: string, score: number | null, status: string, criteria: any[], notes = "") {
  return { stage: stageKey, score, weight: STAGE_WEIGHT[stageKey], status, notes, criteria };
}

function transcriptBlock() {
  return { transcript: { text: SEGMENTS.map((s) => `${s.speaker}: ${s.text}`).join("\n"), segments: SEGMENTS } };
}

function provenance(extra: Record<string, any> = {}) {
  return {
    scoring_provider: "openai",
    scoring_model: "gpt-4o-mini",
    scorecard_source: "company_default",
    scorecard_id: "sc-fixture-001",
    scorecard_version_id: "scv-fixture-001",
    scorecard_version: 1,
    scorecard_name: "UFC Sales Scorecard",
    context_version: 1,
    prompt_version: "scoring-prompt-v2",
    rubric_version: "v2",
    cache_key_version: "v2",
    criteria_version: "scorecard:scv-fixture-001",
    ...extra,
  };
}

// v1 top-level projection (what old readers use) — always present so fallback works.
function v1Projection(overall: number, stages: Record<string, { score: number; notes: string }>) {
  return {
    overall,
    summary: "Fixture call.",
    stages,
    moments: [],
    suggestions: [],
    rubric: {
      _meta: {
        rubric_version: "v2",
        prompt_version: "scoring-prompt-v2",
        model_version: "gpt-4o-mini",
        scoring_model_version: "gpt-4o-mini:scoring-prompt-v2:v2",
        scorecard_source: "company_default",
      },
    },
  };
}

// ── 1. Strong, non-degraded ───────────────────────────────────────────────────
const strong = {
  ...transcriptBlock(),
  // overall / summary / stages are supplied by the v1Projection spread at the
  // end of this object (it is spread last, so it is authoritative).
  v2: {
    contract_version: "v2",
    overall_score: 84,
    summary: "Confident, well-structured call with a clear next step.",
    stages: [
      stage("intro", 82, "pass", [crit("intro", { status: "pass", score: 82, evidence: [ev(0, "I want to keep this to fifteen minutes and agree a next step if it's a fit."), ev(2, "We work with twelve combat-sports gyms on exactly this, so I've seen how messy call reviews get at scale.")], coaching: "Keep leading with a time-boxed agenda and a credibility anchor." })], "Clear agenda and credibility."),
      stage("discovery", 88, "pass", [crit("discovery", { status: "pass", score: 88, evidence: [ev(1, "We review calls manually at the moment.")], coaching: "Keep surfacing the current process before pitching." })], "Strong discovery."),
      stage("objection", 80, "pass", [crit("objection", { status: "pass", score: 80, evidence: [ev(3, "Honestly it feels expensive for what it is."), ev(4, "most teams find the time saved on reviews pays it back inside a quarter.")], coaching: "Keep reframing price against value delivered." })], "Reframed price to value."),
      stage("close", 84, "pass", [crit("close", { status: "pass", score: 84, evidence: [ev(6, "Shall we get a short call with both of you in the diary for Thursday?")], coaching: "Keep making a specific, dated ask." })], "Clear dated next step."),
    ],
    objection_matches: [],
    confidence: { level: "high", value: 0.9 },
    degraded_score: false,
    degraded_reason: null,
    provenance: provenance(),
    trend_delta: 5,
  },
  ...{ ...v1Projection(84, { intro: { score: 82, notes: "Clear agenda." }, discovery: { score: 88, notes: "Strong discovery." }, objection: { score: 80, notes: "Handled well." }, close: { score: 84, notes: "Clean next step." } }) },
};

// ── 2. Degraded / stub ────────────────────────────────────────────────────────
const degraded = {
  ...transcriptBlock(),
  overall: 0,
  summary: "Deterministic stub score (no model call).",
  stages: { intro: { score: 0, notes: "Not assessed — stub." }, discovery: { score: 0, notes: "Not assessed — stub." }, objection: { score: 0, notes: "Not assessed — stub." }, close: { score: 0, notes: "Not assessed — stub." } },
  v2: {
    contract_version: "v2",
    overall_score: 0,
    summary: "Deterministic stub score (no model call).",
    stages: ["intro", "discovery", "objection", "close"].map((s) => stage(s, null, "not_observed", [crit(s, { status: "not_observed", score: null, coaching: "Run with a real scorer for criterion-level feedback." })], "Not assessed — stub.")),
    objection_matches: [],
    confidence: { level: "low", value: 0 },
    degraded_score: true,
    degraded_reason: "stub_provider",
    provenance: provenance({ scoring_provider: "stub", scoring_model: "stub:v1" }),
    trend_delta: 0,
  },
};

// ── 3. Mixed pass/partial/fail/not-observed ───────────────────────────────────
const mixed = {
  ...transcriptBlock(),
  // overall / summary / stages are supplied by the v1Projection spread at the
  // end of this object (it is spread last, so it is authoritative).
  v2: {
    contract_version: "v2",
    overall_score: 52,
    summary: "Good rapport but the close slipped.",
    stages: [
      stage("intro", 78, "pass", [crit("intro", { status: "pass", score: 78, evidence: [ev(0, "I want to keep this to fifteen minutes and agree a next step if it's a fit.")], coaching: "Keep the time-boxed agenda." })], "Solid open."),
      stage("discovery", 60, "partial", [crit("discovery", { status: "partial", score: 60, evidence: [ev(1, "We review calls manually at the moment.")], why: "Uncovered the current process but not the decision route or timeline.", pointsLost: 12, coaching: "Ask who else signs off and by when.", drill: { key: "discovery", title: "Discovery Depth Drill" } })], "Some depth missing."),
      stage("objection", 40, "fail", [crit("objection", { status: "fail", score: 40, evidence: [ev(3, "Honestly it feels expensive for what it is.")], why: "The price objection was acknowledged but never isolated or reframed.", pointsLost: 18, coaching: "Isolate the objection, then reframe against value.", drill: { key: "objection", title: "Objection Handling Drill" }, critical: true })], "Objection not isolated."),
      stage("close", 52, "not_observed", [crit("close", { status: "not_observed", score: null, coaching: "No close was attempted — always make a dated ask." })], "No dated next step."),
    ],
    objection_matches: [],
    confidence: { level: "medium", value: 0.68 },
    degraded_score: false,
    degraded_reason: null,
    provenance: provenance(),
    trend_delta: -3,
  },
  ...{ ...v1Projection(52, { intro: { score: 78, notes: "Solid open." }, discovery: { score: 60, notes: "Some depth missing." }, objection: { score: 40, notes: "Objection not isolated." }, close: { score: 52, notes: "No dated next step." } }) },
};

// ── 4. With objection matches (one linked, one unlinked) ──────────────────────
const withObjections = {
  ...transcriptBlock(),
  // overall / summary / stages are supplied by the v1Projection spread at the
  // end of this object (it is spread last, so it is authoritative).
  v2: {
    contract_version: "v2",
    overall_score: 58,
    summary: "Two objections surfaced; one handled, one missed.",
    stages: [
      stage("intro", 80, "pass", [crit("intro", { status: "pass", score: 80, evidence: [ev(0, "I want to keep this to fifteen minutes and agree a next step if it's a fit.")], coaching: "Keep the agenda tight." })]),
      stage("discovery", 62, "partial", [crit("discovery", { status: "partial", score: 62, evidence: [ev(1, "We review calls manually at the moment.")], why: "Process uncovered, decision route not.", pointsLost: 11, coaching: "Map the buying group." })]),
      stage("objection", 55, "partial", [crit("objection", { status: "partial", score: 55, evidence: [ev(4, "most teams find the time saved on reviews pays it back inside a quarter.")], why: "Price reframed, authority stall left unaddressed.", pointsLost: 14, coaching: "Address the partner sign-off directly.", drill: { key: "objection", title: "Objection Handling Drill" } })]),
      stage("close", 50, "fail", [crit("close", { status: "fail", score: 50, evidence: [ev(6, "Shall we get a short call with both of you in the diary for Thursday?")], why: "Asked for a next step but did not lock a specific date.", pointsLost: 10, coaching: "Lock the date and time explicitly.", drill: { key: "close", title: "Closing & Next-Step Drill" } })]),
    ],
    objection_matches: [
      { detected_text: "Honestly it feels expensive for what it is.", objection_item_id: "obj-item-price-001", objection_item_key: "too-expensive", objection_label: "Too expensive", category: "price", handled: "handled", evidence: ev(3, "Honestly it feels expensive for what it is.") },
      { detected_text: "I'd need to speak with my partner before deciding.", objection_item_id: null, objection_item_key: "speak-with-partner", objection_label: "Need to speak with my partner", category: "authority", handled: "missed", evidence: ev(5, "I'd need to speak with my partner before deciding.") },
    ],
    confidence: { level: "medium", value: 0.72 },
    degraded_score: false,
    degraded_reason: null,
    provenance: provenance(),
    trend_delta: -1,
  },
  ...{ ...v1Projection(58, { intro: { score: 80, notes: "" }, discovery: { score: 62, notes: "" }, objection: { score: 55, notes: "" }, close: { score: 50, notes: "" } }) },
};

// ── 5. v1-only (no .v2) — must render exactly as today ────────────────────────
const v1Only = {
  ...transcriptBlock(),
  overall: 71,
  summary: "Legacy v1-scored call.",
  stages: { intro: { score: 70, notes: "Fine open." }, discovery: { score: 74, notes: "Good discovery." }, objection: { score: 68, notes: "Ok." }, close: { score: 72, notes: "Reasonable close." } },
  moments: [],
  suggestions: ["Tighten the close."],
};

// ── 6. Malformed v2 — must fall back to v1 (only 3 stages) ─────────────────────
const malformed = {
  ...transcriptBlock(),
  overall: 66,
  summary: "Call with a broken v2 blob.",
  stages: { intro: { score: 66, notes: "Open." }, discovery: { score: 70, notes: "Discovery." }, objection: { score: 60, notes: "Objection." }, close: { score: 64, notes: "Close." } },
  v2: {
    contract_version: "v2",
    overall_score: 66,
    summary: "Broken.",
    stages: [stage("intro", 66, "pass", [crit("intro", { status: "pass", score: 66 })]), stage("discovery", 70, "pass", [crit("discovery", { status: "pass", score: 70 })]), stage("objection", 60, "pass", [crit("objection", { status: "pass", score: 60 })])], // only 3 stages → invalid
    objection_matches: [],
    confidence: { level: "medium", value: 0.5 },
    degraded_score: false,
    degraded_reason: null,
    provenance: provenance(),
  },
};

export interface ScoringV2Fixture {
  id: string;
  title: string;
  blurb: string;
  analysisJson: any;
}

export const SCORING_V2_FIXTURES: ScoringV2Fixture[] = [
  { id: "strong", title: "Strong · non-degraded", blurb: "All criteria pass, high confidence, evidence with timestamps.", analysisJson: strong },
  { id: "mixed", title: "Mixed · pass/partial/fail/not-observed", blurb: "Every status, point-loss reasons, coaching and drills.", analysisJson: mixed },
  { id: "objections", title: "Objection matches", blurb: "One linked to the library, one without a real id.", analysisJson: withObjections },
  { id: "degraded", title: "Degraded · stub", blurb: "Provisional banner, not-observed criteria.", analysisJson: degraded },
  { id: "v1only", title: "v1-only (no v2)", blurb: "Renders exactly as today — no criteria UI.", analysisJson: v1Only },
  { id: "malformed", title: "Malformed v2 → v1 fallback", blurb: "Broken v2 (3 stages) falls back to v1.", analysisJson: malformed },
];

export function getFixture(id: string): ScoringV2Fixture | null {
  return SCORING_V2_FIXTURES.find((f) => f.id === id) ?? null;
}
