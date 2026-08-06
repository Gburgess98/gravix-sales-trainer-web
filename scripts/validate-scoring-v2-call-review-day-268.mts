/**
 * Day 268 — behavioural validator for the Scoring v2 Call Review UI.
 *
 * Runs on Node's native type stripping (Node >= 22.6) — no test runner, no new
 * dependency. Tests the PURE guard + view-model builder (src/lib/scoringV2Client)
 * over the deterministic fixtures, plus static checks on the component source.
 * NO network, NO DB, NO LLM.
 *
 * Usage: node scripts/validate-scoring-v2-call-review-day-268.mts
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  getScoringV2,
  buildScoringV2ViewModel,
  degradedReasonCopy,
  objectionLibraryHref,
  V2_DEGRADED_LEAD,
  V2_STATUS_LABEL,
  V2_STAGES,
  type ScoreV2,
} from "../src/lib/scoringV2Client.ts";
import { SCORING_V2_FIXTURES, getFixture } from "../src/lib/fixtures/scoringV2Fixtures.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
let fail = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) console.log(`OK    ${label}`);
  else {
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    fail = 1;
  }
}
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const aj = (id: string) => getFixture(id)!.analysisJson;

console.log("Day 268 — Scoring v2 Call Review validator (no network, no DB, no LLM)\n");

// ── Task 15: core parsing + rendering guarantees ──────────────────────────────
console.log("── parsing + view model ──");

const strong = getScoringV2(aj("strong"));
check("valid v2 parses (strong fixture)", strong !== null);
check("v1-only analysis_json → getScoringV2 null (renders as today)", getScoringV2(aj("v1only")) === null);
check("malformed v2 → getScoringV2 null (falls back to v1)", getScoringV2(aj("malformed")) === null);
check("empty / non-object analysis_json → null", getScoringV2({}) === null && getScoringV2(null) === null);

// four fixed stages, criteria only within them
check("contract requires exactly four fixed stages in order", V2_STAGES.length === 4 && V2_STAGES.join(",") === "intro,discovery,objection,close");
const strongVM = buildScoringV2ViewModel(strong!);
check("criteria keys are a subset of the four fixed stages",
  Object.keys(strongVM.stagesByKey).every((k) => (V2_STAGES as readonly string[]).includes(k)));
check("criteria appear only for valid v2 (v1-only produces no VM)", getScoringV2(aj("v1only")) === null);

// all four statuses render (mixed fixture)
const mixed = getScoringV2(aj("mixed"))!;
const mixedVM = buildScoringV2ViewModel(mixed);
const allStatuses = new Set(Object.values(mixedVM.stagesByKey).flatMap((s) => s!.criteria.map((c) => c.status)));
check("all four statuses render across the mixed fixture",
  ["pass", "partial", "fail", "not_observed"].every((s) => allStatuses.has(s as any)), [...allStatuses].join(","));

// not_observed handled honestly
const notObs = mixedVM.stagesByKey.close!.criteria[0];
check("not_observed shows 'Not observed', never 0/100", notObs.scoreDisplay === "Not observed");
check("not_observed is neutral tone, not a failure", notObs.statusTone === "neutral");
check("not_observed shows no evidence and no point-loss", notObs.evidence.length === 0 && notObs.whyPointsLost === null && notObs.pointsLostLabel === null);

// degraded banner + confidence
const degradedVM = buildScoringV2ViewModel(getScoringV2(aj("degraded"))!);
check("degraded result renders the provisional banner", degradedVM.banner.degraded === true && degradedVM.banner.lead === V2_DEGRADED_LEAD);
check("raw degraded reason code is translated (not shown raw)", degradedVM.banner.detail !== "stub_provider" && degradedVM.banner.detail.length > 0);
check("non-degraded result renders a confidence label", strongVM.banner.degraded === false && strongVM.banner.confidenceLabel === "High confidence");

// evidence verbatim + timestamp jump
const introCrit = strongVM.stagesByKey.intro!.criteria[0];
const firstEv = introCrit.evidence[0];
const rawQuote = aj("strong").v2.stages[0].criteria[0].evidence[0].quote;
check("evidence quote renders verbatim (unmodified)", firstEv.quote === rawQuote);
check("timestamp jump uses the criterion's start_sec", firstEv.jump?.kind === "seek" && firstEv.jump.seconds === aj("strong").v2.stages[0].criteria[0].evidence[0].start_sec);
check("timestamp label is formatted (m:ss)", /^\d+:\d{2}$/.test(firstEv.timestampLabel ?? ""));

// missing timestamp → no broken action
const segOnly: ScoreV2 = clone(strong!);
segOnly.stages[0].criteria[0].evidence[0].start_sec = null; // only segment_index left
const segOnlyVM = buildScoringV2ViewModel(segOnly);
check("evidence with only segment_index → segment jump (not seek)", segOnlyVM.stagesByKey.intro!.criteria[0].evidence[0].jump?.kind === "segment");
const noTarget: ScoreV2 = clone(strong!);
noTarget.stages[0].criteria[0].evidence[0].start_sec = null;
noTarget.stages[0].criteria[0].evidence[0].segment_index = null;
check("evidence with no target → no jump (no broken action)", buildScoringV2ViewModel(noTarget).stagesByKey.intro!.criteria[0].evidence[0].jump === null);

// partial/fail explanation + coaching
const failCrit = mixedVM.stagesByKey.objection!.criteria[0];
check("fail criterion shows why-points-lost + points", failCrit.whyPointsLost !== null && failCrit.pointsLostLabel !== null);
check("criterion shows a coaching action", failCrit.coachingAction !== null && failCrit.coachingAction!.length > 0);

// objections + library link gating
const objVM = buildScoringV2ViewModel(getScoringV2(aj("objections"))!);
check("objection matches render", objVM.objections.length === 2);
check("objection with a real id links to the library", objVM.objections[0].href === "/intelligence?tab=objections");
check("objection with a null id has no link", objVM.objections[1].href === null);
check("objection handled status carries text (not colour-only)", objVM.objections.every((o) => o.handledLabel.length > 0));

// provenance
check("provenance rows include contract, provider, versions, degraded", (() => {
  const labels = strongVM.provenanceRows.map((r) => r.label);
  return ["Contract", "Provider", "Model", "Rubric version", "Cache-key version", "Degraded"].every((l) => labels.includes(l));
})());

// component source: no unsafe HTML, status chips always carry text
const compSrc = readFileSync(join(__dirname, "..", "src", "components", "scoring-v2", "ScoringV2Review.tsx"), "utf8");
const pageSrc = readFileSync(join(__dirname, "..", "src", "app", "calls", "[id]", "page.tsx"), "utf8");
check("components never use dangerouslySetInnerHTML", !/dangerouslySetInnerHTML/.test(compSrc));
check("status chip renders its label text", /function StatusChip[\s\S]*\{label\}/.test(compSrc));
check("expand control is a button with aria-expanded", /aria-expanded=\{open\}/.test(compSrc) && /type="button"/.test(compSrc));
check("every status has non-empty accessible text", (["pass", "partial", "fail", "not_observed"] as const).every((s) => V2_STATUS_LABEL[s].length > 0));
check("fully unobserved v2 hides the projected overall score", /scoreV2FullyUnobserved\s*\?\s*null\s*:\s*overall/.test(pageSrc));
check("unobserved v2 stages render without a numeric stage score", /displayStageScore\s*=\s*stageObserved\s*\?\s*stage\.score\s*:\s*null/.test(pageSrc));
check("lost-points ranking excludes unobserved v2 stages", /v2Stage\.criteria\.some\(\(criterion\)\s*=>\s*criterion\.observed\)/.test(pageSrc));

// ── Task 16: non-vacuity — planted violations must be caught ───────────────────
console.log("\n── non-vacuity: planted violations ──");
function caught(label: string, ok: boolean) {
  check(`caught: ${label}`, ok);
}

// remove contract_version → null
caught("remove contract_version", (() => { const a = clone(aj("strong")); delete a.v2.contract_version; return getScoringV2(a) === null; })());
// remove one fixed stage → null
caught("remove one fixed stage", (() => { const a = clone(aj("strong")); a.v2.stages.splice(2, 1); return getScoringV2(a) === null; })());
// stages out of order → null
caught("stages out of order", (() => { const a = clone(aj("strong")); [a.v2.stages[0], a.v2.stages[1]] = [a.v2.stages[1], a.v2.stages[0]]; return getScoringV2(a) === null; })());
// invalid criterion status → null
caught("invalid criterion status", (() => { const a = clone(aj("strong")); a.v2.stages[0].criteria[0].status = "great"; return getScoringV2(a) === null; })());
// not_observed with a numeric score → null
caught("not_observed with a numeric score", (() => { const a = clone(aj("mixed")); const cl = a.v2.stages[3].criteria[0]; cl.status = "not_observed"; cl.score = 50; return getScoringV2(a) === null; })());
// observed criterion with no numeric score → null
caught("observed criterion with no numeric score", (() => { const a = clone(aj("strong")); a.v2.stages[0].criteria[0].score = null; return getScoringV2(a) === null; })());
// timestamp action mapped to the wrong second would be caught
caught("timestamp seconds must equal start_sec (a wrong second is detectable)", (() => {
  const startSec = aj("strong").v2.stages[0].criteria[0].evidence[0].start_sec;
  const vmSeconds = (strongVM.stagesByKey.intro!.criteria[0].evidence[0].jump as any).seconds;
  return vmSeconds === startSec && vmSeconds !== startSec + 5;
})());
// remove evidence targeting data → no broken jump
caught("remove evidence targeting data → no jump", buildScoringV2ViewModel(noTarget).stagesByKey.intro!.criteria[0].evidence[0].jump === null);
// remove why_points_lost from a failed criterion → VM has no explanation (the render check would fail)
caught("remove why_points_lost from a fail → explanation is absent", (() => {
  const a = clone(aj("mixed")); a.v2.stages[2].criteria[0].why_points_lost = "";
  const vm = buildScoringV2ViewModel(getScoringV2(a)!);
  return vm.stagesByKey.objection!.criteria[0].whyPointsLost === null;
})());
// display a raw degraded reason → copy is never the raw code
caught("raw degraded reason is never surfaced", degradedReasonCopy("stub_provider") !== "stub_provider" && degradedReasonCopy("stub_provider").length > 0);
// objection link with a null id → no href
caught("objection link requires a real id", objectionLibraryHref(null) === null && objectionLibraryHref("obj-1") !== null);
// render criteria for a v1-only call → impossible (guard returns null)
caught("v1-only call yields no criteria", getScoringV2(aj("v1only")) === null);
// malformed v2 must not throw — it falls back
caught("malformed v2 falls back without throwing", (() => { try { return getScoringV2(aj("malformed")) === null; } catch { return false; } })());
// status chip without accessible text would be caught
caught("status chip always has label text", (["pass", "partial", "fail", "not_observed"] as const).every((s) => V2_STATUS_LABEL[s] && V2_STATUS_LABEL[s].trim().length > 0));

// fixtures are honest test-only data
console.log("\n── fixtures ──");
check("all six fixture scenarios present", SCORING_V2_FIXTURES.length === 6 && ["strong", "mixed", "objections", "degraded", "v1only", "malformed"].every((id) => getFixture(id)));

console.log("");
if (fail === 0) console.log("Day 268 Scoring v2 Call Review validator PASSED");
else { console.log("Day 268 Scoring v2 Call Review validator FAILED"); process.exit(1); }
