# Kendo Scoring Parity Audit

**Type:** strategy / audit (no runtime, UI, provider or model changes).
**Date:** Day 263. **Repos audited:** WEB `~/Dev/gravix-sales-trainer-web`,
API `~/Dev/gravix-sales-trainer-api`. UK spelling.

**Purpose:** honestly measure Gravix call scoring + coaching against the bar a
best-in-class, criteria-level scoring product ("Kendo-level") sets, and name what
must improve before we can claim parity or better.

> **Honesty note on the "Kendo-level" column.** This audit uses *current product
> truth* for Gravix (verified against the code cited below). The "Kendo-level"
> expectations are the industry bar for criteria-based conversation scoring,
> derived from the Day-263 requirement list — not reverse-engineered claims about
> a specific competitor's internals. Where a requirement is an assumption, it is
> labelled as the expected bar, not a fact about Kendo.

---

## 1. Current Gravix scoring — verified capability

**Runtime (API `src/lib/scoring.ts`, `src/lib/intelligenceRuntime.ts`):**

- One LLM scoring call: `getOpenAI().chat.completions.create` with `model=AI_MODEL`
  (default `gpt-4o-mini`), `temperature: 0`, a strict `json_schema`
  (`SalesCallScore`). Deterministic per input, cached in `score_cache`.
- **Output shape** (`SalesCallScore` schema): `overall` (0–100), `summary`,
  `stages` = **fixed four** `{ intro, discovery, objection, close }`, each a single
  `{ score 0–100, notes ≤300 }`; `moments[]` = `{ type
  (objection|mistake|highlight|closing_attempt), text ≤280, severity
  (low|med|high), timestamp }`; `suggestions[]` (≤6 strings).
- **Voice sub-score** (`voice`): clarity / confidence / filler_density / pace +
  overall (heuristic from transcript, not the LLM).
- **Intelligence Layer provenance** (Day 218–223): the scorecard + company context
  are *resolved per call* and stamped into `rubric._meta`
  (`scorecard_name/source/version`, `context_version/published_at`,
  `model_version`, `scoring_model_version`, `scoring_provider`). The scorecard
  **shapes the prompt/emphasis**, but the scored **output stays the fixed
  four-stage skeleton** — it does not yet emit per-criterion rows.
- **Provider/cost safety** (Day 258–262): `SCORING_PROVIDER=openai|stub`
  (default openai); stub = deterministic `stub:v1`, no paid call; cache key is
  provider-namespaced so stub QA can't pollute production. Sparring brain is a
  separate provider interface (OpenAI default; Claude behind a flag, credit-blocked).
- **Fallback:** on any LLM failure, `heuristicScoreFallback()` returns a flat
  `overall=68` with the same 68 on every stage and a generic note
  (`model: "heuristic:v1"`) — a *degraded* score that is shaped like a real one.
- **Manager signals:** `review_flags`, `threshold_band` (critical/low/null),
  `needs_manager_review`.

**Call Review UI (WEB `src/app/calls/[id]/page.tsx`, `src/lib/scoringProvenance.ts`):**

- Overall score + stage rows (score + notes), green/amber/red = **status only**.
- "Where points were lost": stages below 70, weakest-first (Day 216) — **stage
  level, from stage notes**, not per-criterion.
- Scoring provenance chip: "scored with <scorecard>", "Company context vN applied",
  model label — calm, never surfaces raw UUIDs, never over-claims (Day 223).
- Whisperer moments linked to the call (timestamps); pins (create/delete);
  transcript player; rep score-trend sparkline.
- Assign Coaching (rule-based pre-fill by weakest stage → `/assignments`) and
  Assign Drill; coach notes (`/v1/coach/notes`); auto-complete assignment on review.
- Objection Library workspace + objection→assignment flow (Days 250–255), and an
  Intelligence workspace for context/scorecard/objections.

---

## 2. Parity matrix (Day-263 requirement set)

Legend: ✅ Exists · 🟡 Partial · ❌ Missing · ⚠️ Risk/unproven

| # | Requirement | Status | Evidence / gap |
|---|---|---|---|
| 1 | Stage score | ✅ | 4 fixed stages, 0–100 each (`stages.*.score`). WEB also renders a `pitch` row if present. |
| 2 | Criteria-level score | ❌ | Each stage is **one** score+notes. No sub-criteria scores. Scorecard criteria shape the prompt, not the output. |
| 3 | Pass / partial / fail per criterion | ❌ | Only a numeric stage score + green/amber/red status band. No per-criterion verdict. |
| 4 | Evidence quote | 🟡 | `moments[].text` (model-written, ≤280) + stage `notes` (prose). Not guaranteed **verbatim** transcript quotes, and not tied to a criterion. |
| 5 | Timestamp / source moment | 🟡 | `moments[].timestamp` + linked Whisperer moments exist; but timestamps are model/nearest-segment, and not attached per criterion. |
| 6 | Why points were lost | 🟡 | Stage-level "below-70, weakest-first" list + stage notes (Day 216). No per-criterion deduction / points-lost maths. |
| 7 | Coaching recommendation | ✅ | `suggestions[]` + `summary` + coach notes. |
| 8 | Suggested drill / assignment | ✅ | Assign Coaching (weakest-stage pre-fill) + Assign Drill → `/assignments`; objection→assignment (Day 254). |
| 9 | Objection match | 🟡 | `moments.type="objection"` is model-detected; Objection Library exists — but the **score output is not matched** to library items. |
| 10 | Company context used | ✅ | `context_version` resolved + stamped + displayed ("Company context vN applied"). |
| 11 | Scorecard version used | ✅ | `scorecard_name/source/version` stamped + displayed; immutable snapshot (Day 219B/220). |
| 12 | Confidence / provenance | 🟡 | Provenance is **strong** (✅). A per-score **confidence value** is ❌ absent. |
| 13 | Trend impact | 🟡 | Rep score-trend sparkline exists; **this call's delta / contribution** to the trend is not surfaced. |
| 14 | Manager override / comment path | 🟡 | Coach notes + pins + `needs_manager_review`/`threshold_band` exist. No manager **score override** or structured review comment on the score itself. |
| 15 | Rep-facing next action | 🟡 | `momentumNext` + suggestions + assignment exist; no dedicated rep-facing scoring-feedback view (planned Day 269). |

**Score:** ✅ 5 · 🟡 8 · ❌ 2 · (plus the ⚠️ risks below). The two hard gaps
(criteria-level score, pass/partial/fail) are the spine of "Kendo-level"; most
🟡s become ✅ once criteria-level output exists to hang evidence/verdicts on.

---

## 3. What Gravix already does well (equal / stronger)

- **Provenance & auditability** — every score records the exact scorecard version,
  company context version and model, with calm honest display. This is often a
  *weakness* in competitors; for us it is a strength (Days 218–223).
- **Deterministic, cost-safe scoring** — cached deterministic scoring, a no-cost
  stub provider, and provider-isolated cache (Days 261–262). Reproducible scores
  and safe QA.
- **Closed manager loop** — scorecard authoring → per-call scoring → assignment →
  sparring proof → trend, already wired (Days 148–255).
- **Objection Library** — approved objections that can drive coaching assignments
  (Days 250–255) — a strong asset to *connect into* scoring.

## 4. Where Gravix is weaker (the real gaps)

1. **No criteria-level scoring.** The unit of scoring is the stage, not the
   criterion. Kendo-level review is criterion-by-criterion.
2. **No pass/partial/fail verdicts.** Numbers + colour, no explicit verdict.
3. **Evidence is prose, not anchored quotes.** No verbatim transcript span tied to
   a criterion with a real timestamp.
4. **No confidence signal.** Can't distinguish a rock-solid score from a shaky one.
5. **No measured scoring quality.** No golden dataset, no regression harness — we
   cannot prove the scores are *good*, only that they're *stable*.
6. **Objection Library not fused into scoring.** Detected objections aren't matched
   to approved library items in the score.
7. **Trend impact invisible per call.** The rep can't see "this call moved you +4".
8. **No manager score override / structured review comment on the score.**
9. **Rep-facing feedback is thin.** No dedicated, criterion-driven rep view.
10. **Heuristic fallback masquerades as a real score** (flat 68), with no visible
    "degraded/low-confidence" marker.

## 5. Missing scoring **output** fields

- `criteria[]` per stage: `{ id, label, score, verdict (pass|partial|fail), weight,
  evidence: { quote, start_sec, end_sec, speaker }, points_lost, why, recommendation }`.
- `confidence` (0–1 or low/med/high) at score and/or criterion level.
- `objection_matches[]` linking detected objections → Objection Library item ids.
- `trend_delta` (this call vs rep's rolling average).
- `evidence` as **verbatim** transcript spans (not free-text).

## 6. Missing **UI trust moments** (Call Review)

- Per-criterion rows with verdict chips + the exact quote + jump-to-timestamp.
- "Points lost" shown as an itemised, per-criterion breakdown summing to the stage.
- A confidence indicator + an explicit "degraded/heuristic score" banner.
- Objection matches surfaced inline with the Library link.
- "This call's impact on your trend" delta.

## 7. Missing **manager** workflows

- Manager score override + a reason/comment attached to the score (audited).
- Agree/disagree on a criterion verdict → feeds calibration.
- Review queue that ranks by low confidence, not only by threshold band.

## 8. Missing **rep** workflows

- A rep-facing "why this score + what to do next" view driven by criteria.
- Per-criterion drill suggestions (not just weakest-stage).
- Acknowledge / self-reflect on a criterion before the drill.

## 9. Runtime risks ⚠️

- **Single LLM call, unmeasured.** Quality is unproven without a harness; a prompt
  or model change could silently regress scores (only cache-determinism is guarded).
- **Silent heuristic degradation.** `heuristic:v1` flat-68 scores are shaped like
  real ones and are not flagged in the UI.
- **Model-authored evidence.** `moments[].text` (≤280) risks hallucinated quotes.
- **Fixed-4-stage contract is load-bearing.** The JSON schema, WEB readers
  (`analysis_json.stages`), provenance, and pinned validators all assume it —
  criteria-level output must be **additive** to avoid breaking them.
- **Cross-provider cache** is isolated (Day 262), but criteria output will change
  the score shape → cache/version bump needed (see Day 264 contract).

## 10. Data / test gaps

- **No golden call dataset** with human-agreed criterion scores/verdicts.
- **No scoring harness** (accuracy/regression) — only provenance + determinism
  validators exist.
- **No objection→criterion mapping** data.
- **No confidence calibration** data.

---

## 11. Top 10 gaps, prioritised (build order)

1. Criteria-level output contract (blocks 2, 3, 4, 5, 6).
2. Golden call dataset (blocks any quality claim).
3. Scoring harness / regression suite.
4. Criteria-level runtime output (verdict + evidence + points-lost).
5. Verbatim, timestamped evidence per criterion.
6. Call Review criteria UI (verdict chips + quote + jump).
7. Confidence signal + "degraded score" banner.
8. Objection-Library match in the score.
9. Rep-facing criteria feedback view.
10. Manager override/comment + trend-delta.

---

## 12. Recommended Scoring v2 roadmap

| Day | Deliverable | Notes |
|---|---|---|
| **264** | **Scoring Output Contract v2** | Define the additive `criteria[]` + `confidence` + `objection_matches[]` + `trend_delta` shape. Keep the fixed-4-stage skeleton as a back-compat projection so pinned readers/validators don't break. Bump rubric/prompt versions + cache key. Docs/spec only. |
| **265** | **Golden Call Dataset** | A small, human-scored set (per-criterion verdicts + expected evidence). The ground truth everything else is measured against. |
| **266** | **Scoring Harness** | Runs the scorer over the golden set, reports accuracy/drift per criterion; gates prompt/model/provider changes. Uses the `stub`/no-cost lane where possible. |
| **267** | **Criteria-level runtime output** | Emit `criteria[]` (verdict + evidence span + points-lost) additively behind the v2 contract; default path stays byte-identical until switched. |
| **268** | **Call Review criteria UI** | Per-criterion rows, verdict chips, verbatim quote + jump-to-timestamp, itemised points-lost, confidence + degraded banner. |
| **269** | **Rep-facing scoring feedback** | Criterion-driven "why + next action" rep view; per-criterion drills; trend-delta. |

**Guardrails for v2:** additive contract only (never break the 4-stage readers or
pins), evidence must be verbatim transcript spans, confidence must flag the
heuristic fallback, and no prompt/model change ships without passing the Day-266
harness against the Day-265 golden set.

---

## 13. Validation (Day 263, docs-only)

WEB: intelligence-workspace-233 PASSED · tier-2b-smoke PASSED ·
objection-library-250 PASSED. API: intelligence-runtime 53/53 ·
scoring-provider-stub PASS · score-cache-provider-isolation PASS · schema-selects
PASSED · typecheck 60 (baseline). No runtime/UI/provider/model changes.
