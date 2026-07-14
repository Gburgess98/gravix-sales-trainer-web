/**
 * Day 223 — behavioural fixtures for the call review provenance helper.
 *
 * Runs on Node's native type stripping (Node >= 22.6), so it needs no test
 * runner and no new dependency — the WEB repo has neither. Invoked by
 * scripts/validate-premium-ux-day-223.sh.
 *
 * Usage: node scripts/validate-scoring-provenance-day-223.mts
 */

import {
  GRAVIX_DEFAULT_RUBRIC_LABEL,
  UNNAMED_COMPANY_SCORECARD_LABEL,
  getScoringProvenance,
} from "../src/lib/scoringProvenance.ts";

let fail = 0;
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`OK    ${label}`);
  } else {
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
    fail = 1;
  }
}

console.log("Day 223 — scoring provenance helper fixtures");

// --- 1. Old calls: no provenance at all -------------------------------------
// The UFC hero call's real shape: scored before the runtime stamped provenance.
const heroMeta = {
  _meta: {
    voice: { pace: 93, overall: 96 },
    call_sha256: null,
    model_version: "gpt-4o-mini:v1:v1",
    prompt_version: "v1",
    rubric_version: "v1",
    transcript_hash: "c32c3ad8",
    transcript_present: true,
  },
};
const hero = getScoringProvenance(heroMeta, "gpt-4o-mini:v1:v1");
check("old call (_meta without provenance) → Gravix default rubric",
  hero.scorecardLabel === GRAVIX_DEFAULT_RUBRIC_LABEL, hero.scorecardLabel);
check("old call → not flagged as a company scorecard", hero.hasCustomScorecard === false);
check("old call → no context claim", hero.contextLabel === null && hero.hasCompanyContext === false);
check("old call → falls back to ai_model for the model label",
  hero.modelLabel === "gpt-4o-mini:v1:v1", String(hero.modelLabel));

const noRubric = getScoringProvenance(null, null);
check("null rubric → Gravix default rubric, nothing claimed",
  noRubric.scorecardLabel === GRAVIX_DEFAULT_RUBRIC_LABEL &&
  noRubric.contextLabel === null &&
  noRubric.modelLabel === null &&
  noRubric.detailTitle === null);

const emptyRubric = getScoringProvenance({}, null);
check("rubric without _meta → Gravix default rubric",
  emptyRubric.scorecardLabel === GRAVIX_DEFAULT_RUBRIC_LABEL);

// --- 2. Explicit gravix_default source --------------------------------------
const gravix = getScoringProvenance({
  _meta: { scorecard_source: "gravix_default", scorecard_name: GRAVIX_DEFAULT_RUBRIC_LABEL, rubric_version: "v1" },
});
check("gravix_default source → Gravix default rubric",
  gravix.scorecardLabel === GRAVIX_DEFAULT_RUBRIC_LABEL && gravix.hasCustomScorecard === false);
check("gravix_default source → 'Gravix default' source label",
  gravix.scorecardSourceLabel === "Gravix default");

// --- 3. Company default scorecard (the Day 222 live-proof shape) ------------
const companyDefault = getScoringProvenance({
  _meta: {
    scoring_model_version: "gpt-4o-mini:v1:v1",
    rubric_version: "v1",
    scorecard_source: "company_default",
    scorecard_name: "UFC Elite — Company Default",
    scorecard_id: "1b2c3d4e-1111-4aaa-8bbb-222233334444",
    scorecard_version_id: "9f8e7d6c-5555-4ccc-8ddd-666677778888",
    scorecard_version: 1,
    context_version: 1,
    context_published_at: "2026-07-14T10:00:00.000Z",
  },
});
check("company_default → scorecard name + version label",
  companyDefault.scorecardLabel === "UFC Elite — Company Default v1", companyDefault.scorecardLabel);
check("company_default → flagged as a company scorecard", companyDefault.hasCustomScorecard === true);
check("company_default → 'Company default' source label",
  companyDefault.scorecardSourceLabel === "Company default");
check("context_version → context applied label",
  companyDefault.contextLabel === "Company context v1 applied" && companyDefault.hasCompanyContext === true);
check("prefers scoring_model_version over the ai_model fallback",
  getScoringProvenance(companyDefault_meta(), "SHOULD-NOT-WIN").modelLabel === "gpt-4o-mini:v1:v1");
check("full identifiers live only in the hover detail",
  (companyDefault.detailTitle ?? "").includes("1b2c3d4e-1111-4aaa-8bbb-222233334444") &&
  (companyDefault.detailTitle ?? "").includes("Context published"));
check("visible labels never contain a raw identifier",
  !companyDefault.scorecardLabel.includes("-4aaa-") && !companyDefault.scorecardSourceLabel.includes("-"));

function companyDefault_meta() {
  return {
    _meta: {
      scoring_model_version: "gpt-4o-mini:v1:v1",
      scorecard_source: "company_default",
      scorecard_name: "UFC Elite — Company Default",
      scorecard_version: 1,
    },
  };
}

// --- 4. Call-type (custom) scorecard ----------------------------------------
const custom = getScoringProvenance({
  _meta: {
    scorecard_source: "custom",
    scorecard_name: "Discovery Call Card",
    scorecard_version: 3,
  },
});
check("custom source → scorecard name + version label",
  custom.scorecardLabel === "Discovery Call Card v3", custom.scorecardLabel);
check("custom source → 'Call-type scorecard' source label",
  custom.scorecardSourceLabel === "Call-type scorecard");
check("custom source without context → no context claim", custom.contextLabel === null);

// --- 5. Unsafe / missing scorecard names ------------------------------------
const uuidNamed = getScoringProvenance({
  _meta: {
    scorecard_source: "company_default",
    scorecard_name: "9f8e7d6c-5555-4ccc-8ddd-666677778888",
    scorecard_version: 2,
  },
});
check("UUID-shaped scorecard_name is never displayed",
  !uuidNamed.scorecardLabel.includes("9f8e7d6c"), uuidNamed.scorecardLabel);
check("UUID-shaped name → safe company label, still honest about the source",
  uuidNamed.scorecardLabel === `${UNNAMED_COMPANY_SCORECARD_LABEL} v2` && uuidNamed.hasCustomScorecard === true,
  uuidNamed.scorecardLabel);

const unnamed = getScoringProvenance({
  _meta: { scorecard_source: "company_default", scorecard_name: "   " },
});
check("missing scorecard_name → safe company label, never the Gravix default",
  unnamed.scorecardLabel === UNNAMED_COMPANY_SCORECARD_LABEL && unnamed.hasCustomScorecard === true,
  unnamed.scorecardLabel);

// --- 6. Defensive against junk shapes ---------------------------------------
const junk = getScoringProvenance({
  _meta: {
    scorecard_source: "something_unknown",
    scorecard_name: 42,
    scorecard_version: "not-a-number",
    context_version: 0,
  },
});
check("unknown source → Gravix default, nothing claimed",
  junk.scorecardLabel === GRAVIX_DEFAULT_RUBRIC_LABEL && junk.hasCustomScorecard === false);
check("context_version 0 is not treated as a version",
  junk.contextLabel === null && junk.hasCompanyContext === false);

const badVersion = getScoringProvenance({
  _meta: { scorecard_source: "custom", scorecard_name: "Card", scorecard_version: "not-a-number" },
});
check("unparseable scorecard_version → name without a version suffix",
  badVersion.scorecardLabel === "Card", badVersion.scorecardLabel);

console.log("");
if (fail === 0) {
  console.log("Day 223 provenance fixtures PASSED");
} else {
  console.log("Day 223 provenance fixtures FAILED");
  process.exit(1);
}
