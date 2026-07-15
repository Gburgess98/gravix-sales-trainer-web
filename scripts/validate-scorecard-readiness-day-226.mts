/**
 * Day 226 — behavioural fixtures for the scorecard readiness helper.
 *
 * The readiness panel is only honest if it agrees with the API's own activation
 * gate. These fixtures pin each check to the API error code it mirrors
 * (api src/lib/scorecardStudio.ts `validateForActivation`) and to the API's
 * conflict rules, so a drift on either side shows up here rather than as a
 * manager being told a draft is ready when POST /activate would 400.
 *
 * Runs on Node's native type stripping (Node >= 22.6), so it needs no test
 * runner and no new dependency. Invoked by scripts/validate-premium-ux-day-226.sh.
 *
 * Usage: node scripts/validate-scorecard-readiness-day-226.mts
 */

import {
  computeReadiness,
  previewConflicts,
  SCORECARD_STAGES,
} from "../src/lib/scorecardReadiness.ts";

let fail = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`OK    ${label}`);
  } else {
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    fail = 1;
  }
}

console.log("Day 226 — scorecard readiness helper fixtures");

const fullWeights = [
  { stage: "intro", weight: 20 },
  { stage: "discovery", weight: 30 },
  { stage: "objection", weight: 30 },
  { stage: "close", weight: 20 },
];

function checkById(r: ReturnType<typeof computeReadiness>, id: string) {
  return r.checks.find((c) => c.id === id)!;
}

// --- 1. The seeded UFC shape: a valid company default -----------------------
// Mirrors the real UFC Sales Scorecard v1 (20/30/30/20, 4 criteria, no call
// types, company default) — it must read as ready.
const ufc = computeReadiness({
  weights: fullWeights,
  criteriaCount: 4,
  callTypes: [],
  isCompanyDefault: true,
});
check("UFC-shaped company default is ready", ufc.ready);
check("weight total reported exactly", ufc.weightTotal === 100, `got ${ufc.weightTotal}`);
check(
  "company default satisfies the call-type rule",
  checkById(ufc, "call_type_or_company_default_required").ok
);

// --- 2. missing_stage_weights ----------------------------------------------
const missingStage = computeReadiness({
  weights: [
    { stage: "intro", weight: 40 },
    { stage: "discovery", weight: 60 },
  ],
  criteriaCount: 2,
  callTypes: [],
  isCompanyDefault: true,
});
check("missing stages block readiness", !missingStage.ready);
check("missing stages are named", checkById(missingStage, "missing_stage_weights").detail.includes("objection"));
// The API only checks the total once every stage exists — an incomplete draft
// must show one root cause, not a spurious "total is wrong" too.
check(
  "incomplete draft does not also claim a total failure",
  checkById(missingStage, "weights_must_total_100").detail === "Waiting on stage weights"
);

// --- 3. weights_must_total_100 ---------------------------------------------
const badTotal = computeReadiness({
  weights: [
    { stage: "intro", weight: 25 },
    { stage: "discovery", weight: 25 },
    { stage: "objection", weight: 25 },
    { stage: "close", weight: 30 },
  ],
  criteriaCount: 1,
  callTypes: [],
  isCompanyDefault: true,
});
check("a 105% draft is not ready", !badTotal.ready);
check("the actual total is surfaced", checkById(badTotal, "weights_must_total_100").detail === "Currently 105%");

// --- 4. at_least_one_criterion_required ------------------------------------
const noCriteria = computeReadiness({
  weights: fullWeights,
  criteriaCount: 0,
  callTypes: [],
  isCompanyDefault: true,
});
check("zero criteria blocks readiness", !noCriteria.ready);
check("zero criteria reads honestly", !checkById(noCriteria, "at_least_one_criterion_required").ok);

// --- 5. call_type_or_company_default_required ------------------------------
const noCallType = computeReadiness({
  weights: fullWeights,
  criteriaCount: 3,
  callTypes: [],
  isCompanyDefault: false,
});
check("non-default with no call type blocks readiness", !noCallType.ready);

const withCallType = computeReadiness({
  weights: fullWeights,
  criteriaCount: 3,
  callTypes: ["demo"],
  isCompanyDefault: false,
});
check("non-default with a call type is ready", withCallType.ready);

// --- 6. Every check maps to a real API error code ---------------------------
const API_ERROR_CODES = [
  "missing_stage_weights",
  "weights_must_total_100",
  "at_least_one_criterion_required",
  "call_type_or_company_default_required",
];
check(
  "every readiness check mirrors an API error code",
  ufc.checks.every((c) => API_ERROR_CODES.includes(c.id)) && ufc.checks.length === API_ERROR_CODES.length
);
check("stage list matches the API's fixed stages", SCORECARD_STAGES.join(",") === "intro,discovery,objection,close");

// --- 7. Conflict preview ----------------------------------------------------
const others = [
  {
    scorecardId: "other-1",
    scorecardName: "Demo Calls Scorecard",
    isCompanyDefault: false,
    status: "active",
    activeVersion: { version: 2, call_types: ["demo", "discovery"] },
  },
  {
    scorecardId: "other-2",
    scorecardName: "Legacy Default",
    isCompanyDefault: true,
    status: "active",
    activeVersion: { version: 1, call_types: [] },
  },
];

const callTypeConflict = previewConflicts(
  { scorecardId: "mine", isCompanyDefault: false, callTypes: ["demo"] },
  others
);
check("overlapping call type is previewed as a conflict", callTypeConflict.length === 1);
check("conflict names the scorecard, not an id", callTypeConflict[0]?.scorecardName === "Demo Calls Scorecard");
check("conflict reason is call_type", callTypeConflict[0]?.reason === "call_type");

const defaultConflict = previewConflicts(
  { scorecardId: "mine", isCompanyDefault: true, callTypes: [] },
  others
);
check("a second company default is previewed as a conflict", defaultConflict.some((c) => c.reason === "company_default"));

const noConflict = previewConflicts(
  { scorecardId: "mine", isCompanyDefault: false, callTypes: ["renewal_upsell"] },
  others
);
check("a non-overlapping call type has no conflict", noConflict.length === 0);

// A card never conflicts with itself (re-activating its own scorecard).
const selfConflict = previewConflicts(
  { scorecardId: "other-1", isCompanyDefault: false, callTypes: ["demo"] },
  others
);
check("a scorecard never conflicts with itself", selfConflict.length === 0);

// The seeded UFC reality: sole company default, nothing else active.
const ufcConflicts = previewConflicts(
  { scorecardId: "ufc", isCompanyDefault: true, callTypes: [] },
  []
);
check("the sole company default has no conflicts", ufcConflicts.length === 0);

console.log("");
if (fail) {
  console.log("Day 226 readiness fixtures FAILED");
  process.exit(1);
}
console.log("Day 226 readiness fixtures PASSED");
