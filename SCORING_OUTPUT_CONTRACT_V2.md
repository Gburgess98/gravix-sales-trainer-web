# Scoring Output Contract v2

**Type:** spec / design (no runtime, UI, model/provider or DB changes).
**Day:** 264. **Depends on:** `KENDO_SCORING_PARITY_AUDIT.md` (Day 263).
**Repos:** WEB `~/Dev/gravix-sales-trainer-web`, API `~/Dev/gravix-sales-trainer-api`.
UK spelling.

**Purpose:** define the exact, **additive** scoring output shape that unlocks
criteria-level scoring, evidence-backed explanations, confidence and objection
matching — while projecting cleanly down to today's fixed-four-stage v1 readers so
nothing breaks. This is the contract Days 265–269 build against. **No behaviour
changes on Day 264.**

---

## 1. Design principles

1. **Additive, never subtractive.** v2 adds fields; every v1 field the app reads
   today (`stages.{intro,discovery,objection,close}.{score,notes}`, `moments[]`,
   `suggestions[]`, `rubric._meta`, `overall`, `summary`, `voice`) is still
   produced, with identical meaning, via a deterministic **projection** (§5).
2. **Criteria already exist — reuse them.** The scorecard authoring model already
   stores criteria per stage (API `intelligenceRuntime.ts` → scorecard snapshot
   `stages[].criteria[]`, each with `label, description, emphasis, pass_fail,
   critical, scoring_guidance, good_example, weak_example`). v2 makes the scorer
   **emit a score/verdict/evidence per authored criterion** — it does not invent a
   parallel taxonomy.
3. **Fixed four stages stay the spine.** intro / discovery / objection / close.
   Criteria live *within* a stage. No new top-level stages (matches the Day 221
   guarantee and the scorecard prompt block, which already says "no new stages").
4. **Evidence must be real.** An evidence quote must carry a transcript span
   (`start_sec`/`end_sec` or a segment index) — no free-floating model prose as
   "evidence".
5. **Honesty fields are first-class.** `confidence` and `degraded_score` are part
   of the contract, so a heuristic/stub score can never masquerade as a full one.
6. **Gravix owns provenance.** Every score stamps scorecard/context/prompt/model/
   provider/cache versions (extends today's `rubric._meta`).

---

## 2. Current v1 output (recap, for the projection target)

`SalesCallScore` (API `src/lib/scoring.ts`): `overall`, `summary`,
`stages{intro,discovery,objection,close}` each `{score 0–100, notes}`,
`moments[] {type(objection|mistake|highlight|closing_attempt), text, severity, timestamp}`,
`suggestions[]`, `voice{clarity,confidence,filler_density,pace,overall}`, and
`rubric._meta` (rubric/prompt/model/scoring_model versions, scorecard_name/source/
id/version, context_version/published_at, transcript_hash/present, scoring_provider).
WEB reads stages from `analysis_json.stages ?? rubric.stages ?? rubric` and reads
provenance from `rubric._meta` (`lib/scoringProvenance.ts`).

---

## 3. v2 output shape (canonical)

The scorer produces a **v2 object**; the v1 object is a projection of it (§5).
Types below are the contract (TypeScript-ish, illustrative — not yet code).

```ts
type ContractVersion = "v2";
type CriterionStatus = "pass" | "partial" | "fail" | "not_observed";
type Stage = "intro" | "discovery" | "objection" | "close";
type ScoringProvider = "openai" | "stub";
type Confidence = { level: "low" | "medium" | "high"; value: number }; // value 0–1

interface EvidenceQuote {
  quote: string;            // VERBATIM transcript text (not paraphrased)
  start_sec: number | null; // transcript span start
  end_sec: number | null;   // transcript span end
  segment_index: number | null; // index into analysis_json.transcript.segments
  speaker: string | null;   // "rep" | "buyer" | raw label
}

interface CriterionResult {
  criterion_id: string;     // stable id (see §4.1)
  label: string;            // from scorecard criterion.label
  stage: Stage;
  score: number | null;     // 0–100; null when not_observed
  status: CriterionStatus;  // pass | partial | fail | not_observed
  weight: number;           // criterion weight within its stage (0–100), see §4.2
  emphasis: "low" | "standard" | "high" | "critical"; // from authoring
  pass_fail: boolean;       // authored gate flag
  evidence: EvidenceQuote[];// >=1 unless status = not_observed
  why_points_lost: string | null; // required when status is partial|fail
  points_lost: number | null;     // stage points attributable to this criterion
  coaching_action: string | null; // what the rep should do
  suggested_drill: {              // optional link into the drill/assignment system
    key: string | null;           // e.g. "objection" | "discovery"
    title: string | null;
  } | null;
}

interface ObjectionMatch {
  detected_text: string;    // what was said on the call
  objection_item_id: string | null; // Objection Library id when matched
  objection_label: string | null;
  handled: "handled" | "partially" | "missed" | null;
  evidence: EvidenceQuote | null;
}

interface StageResultV2 {
  stage: Stage;
  score: number;            // 0–100 (weighted roll-up of criteria, §5)
  weight: number;           // stage weight from scorecard (0–100)
  status: CriterionStatus;  // stage-level roll-up verdict
  notes: string;            // concise roll-up (projects to v1 stage.notes)
  criteria: CriterionResult[]; // >= 1 per stage (validator-enforced later)
}

interface ScoreV2 {
  contract_version: ContractVersion; // "v2"
  overall_score: number;    // 0–100 (projects to v1 `overall`)
  summary: string;

  stages: StageResultV2[];  // exactly the four fixed stages, in order
  objection_matches: ObjectionMatch[];

  confidence: Confidence;   // overall confidence
  degraded_score: boolean;  // true for heuristic/stub or low-evidence scores
  degraded_reason: string | null; // "heuristic_fallback" | "stub_provider" | "no_transcript" | ...

  voice: { clarity: number; confidence: number; filler_density: number; pace: number; overall: number };

  provenance: {
    scoring_provider: ScoringProvider; // from SCORING_PROVIDER
    scoring_model: string;             // AI_MODEL, "stub:v1", or "heuristic:v1"
    scorecard_source: "custom" | "company_default" | "gravix_default";
    scorecard_id: string | null;
    scorecard_version_id: string | null;
    scorecard_version: number | null;
    context_version: number | null;
    prompt_version: string;            // v2 prompt version (§6)
    rubric_version: string;
    cache_key_version: string;         // v2 cache namespace marker (§6)
  };
}
```

### 3.1 Field ↔ Day-263 requirement mapping

| Day-263 requirement | v2 field |
|---|---|
| Criteria-level score | `CriterionResult.score` |
| Pass/partial/fail per criterion | `CriterionResult.status` (+ `not_observed`) |
| Criterion weight | `CriterionResult.weight` (+ `emphasis`, `pass_fail`) |
| Evidence quote | `EvidenceQuote.quote` |
| Timestamp / speaker / span | `EvidenceQuote.start_sec/end_sec/segment_index/speaker` |
| Why points lost | `CriterionResult.why_points_lost` + `points_lost` |
| Coaching recommendation | `CriterionResult.coaching_action` |
| Suggested drill/assignment | `CriterionResult.suggested_drill` |
| Objection match | `ScoreV2.objection_matches[]` |
| Company context used | `provenance.context_version` |
| Scorecard version used | `provenance.scorecard_version_id/version` |
| Confidence/provenance | `confidence` + `provenance.*` |
| Trend impact | `trend_delta` (§3.2 — computed, not model-authored) |
| Manager override/comment | out of contract-body scope (§9 storage) |
| Rep-facing next action | projection of `coaching_action` + `suggested_drill` |

### 3.2 `trend_delta` (computed, not model-authored)

`trend_delta` is **not** part of the model's JSON output (the model must not
invent a trend). It is computed by the runtime after scoring, as
`overall_score − rep_rolling_average_before_this_call`, and attached to the v2
object for display. Documented here as a contract field; sourced deterministically.

---

## 4. Criteria details

### 4.1 `criterion_id` (stability decision)

Authored criteria today are keyed by `label` in the prompt block; there is no
guaranteed stable id on each criterion. **Decision:** derive a deterministic id
`criterion_id = "<scorecard_version_id>:<stage>:<slug(label)>"` (or
`"gravix_default:<stage>:<slug(label)>"` for the built-in rubric). This is stable
across re-scores of the same scorecard version and needs no schema change. If/when
the scorecard authoring model adds a persistent `criterion.id`, prefer that and
keep the derived id as a fallback.

### 4.2 Weights

- Stage weight comes from the scorecard snapshot `stages[].weight`.
- Criterion weight: if the authoring model stores a per-criterion weight, use it;
  otherwise distribute the stage's weight **evenly** across its criteria (documented
  default). `emphasis` (`low|standard|high|critical`) and `pass_fail`/`critical`
  flags refine this but do not replace the numeric weight.
- **Invariant (validator, §7):** within a stage, criterion weights sum to 100 (or
  to the stage weight, whichever convention the runtime day picks — pick one and
  assert it). The four stage weights sum to 100.

### 4.3 The Gravix default rubric

The built-in rubric has no authored criteria today. v2 defines a **fixed default
criteria set** (a small, named list per stage — e.g. intro: rapport, agenda;
discovery: needs, qualification; objection: acknowledge, resolve; close: next-step,
commitment). This lives with the runtime (Day 267), is versioned by
`rubric_version`, and gives criteria-level output even when no custom scorecard is
active. Enumerated in the runtime spec, not here.

---

## 5. Back-compat projection (v2 → v1)

The runtime always persists **both** the v2 object and a v1 projection so existing
readers are untouched. Projection rules:

| v1 field | Projected from v2 |
|---|---|
| `overall` | `overall_score` (identical number) |
| `summary` | `summary` (identical) |
| `stages.<stage>.score` | `StageResultV2.score` (weighted roll-up of its criteria; for the Gravix default with no custom scorecard this must equal what v1 would have produced — see note) |
| `stages.<stage>.notes` | concise roll-up of that stage's `partial`/`fail` criteria `why_points_lost` (≤300 chars, matching v1 cap) |
| `moments[]` | each criterion `evidence` + objection matches mapped to `{type, text, severity, timestamp}`: `type` from criterion nature (objection→"objection", fail→"mistake", pass highlight→"highlight", close attempt→"closing_attempt"), `text` = the quote (≤280), `severity` from `emphasis`/`status`, `timestamp` = `start_sec` |
| `suggestions[]` | de-duplicated roll-up of `coaching_action`s (≤6, ≤220 chars each) |
| `voice` | `voice` (identical) |
| `rubric._meta` | **all existing keys unchanged**, plus additive v2 keys: `contract_version`, `confidence`, `degraded_score`, `criteria_count`, `cache_key_version`. Existing WEB `getScoringProvenance` keeps working because it only reads the keys it knows. |

**Projection guarantees (validator, §7):**
- The four v1 stages are always present with numeric scores + notes.
- `moments[]` and `suggestions[]` are always arrays (may be empty).
- No v1 key is removed or retyped.
- Adding v2 `_meta` keys must not change any existing `_meta` value.

> **Note on stage score parity:** where the runtime day chooses to keep the
> Gravix-default path byte-identical, the stage `score` projection must reproduce
> the v1 stage score exactly (i.e. the default rubric's stage score is authoritative
> and criteria are descriptive). Where a custom scorecard drives criteria, the
> stage score is the weighted criteria roll-up. This choice is made on Day 267 and
> asserted by the harness (Day 266); the contract permits either, but requires the
> chosen rule to be deterministic and documented.

---

## 6. Prompt & cache versioning

- **New prompt version:** `SCORING_PROMPT_VERSION` bumps `v1 → v2` (criteria-level
  instructions + evidence-span requirement). New name: `scoring-prompt-v2`.
- **Rubric version:** `RUBRIC_VERSION` bumps `v1 → v2` when the default criteria set
  ships (Day 267).
- **Cache key version:** the deterministic cache key already encodes
  `prompt=<SCORING_PROMPT_VERSION>` and `model=<SCORING_MODEL_VERSION>`
  (`${AI_MODEL}:${SCORING_PROMPT_VERSION}:${RUBRIC_VERSION}`). Bumping prompt/rubric
  to v2 **automatically changes the key**, so v2 scores land in a fresh namespace
  and can never read a v1 cache entry. Additionally stamp an explicit
  `cache_key_version` in `_meta` for observability. **Why v2 must not reuse v1
  cache:** the output shape and prompt differ; a v1 entry has no `criteria[]`, so
  serving it as v2 would be silently incomplete.
- **Provider isolation (Day 262) still holds:** the `provider=stub` segment stacks
  with the new prompt/rubric version — stub-v2 QA scores occupy their own namespace,
  distinct from openai-v2 and from all v1 entries.
- **`SCORING_PROVIDER=stub` under v2:** the stub returns a deterministic v2 object
  with `degraded_score=true`, `degraded_reason="stub_provider"`,
  `scoring_model="stub:v1"`, one synthetic criterion per stage (so shape/validators
  hold), and empty/`not_observed` evidence. No paid call. The heuristic fallback
  behaves the same way with `degraded_reason="heuristic_fallback"`.

---

## 7. Validator requirements (for the future runtime day)

A `validate:scoring-output-v2` (Day 267) must assert:

1. `contract_version === "v2"` and all four fixed stages present, in order.
2. Every stage has ≥1 criterion; every criterion has a stable `criterion_id`,
   `status`, `score` (or `null` iff `not_observed`), `weight`, `emphasis`.
3. Weights: criterion weights sum correctly within each stage; stage weights sum to
   100 (per the §4.2 convention chosen).
4. **No evidence quote without a transcript span** (`start_sec`/`end_sec` or
   `segment_index` present) — and the quote text must be a substring of the
   (normalised) transcript when a transcript exists.
5. **No `fail`/`partial` criterion without `why_points_lost`** (and `points_lost`).
6. `degraded_score` is `true` for stub/heuristic/no-transcript scores and the
   `degraded_reason` is set.
7. **Projection preserves v1 readers:** the v1 projection has the four stages with
   numeric score+notes, `moments[]`/`suggestions[]` arrays, and every pre-existing
   `_meta` key unchanged (diff against a v1 golden).
8. `objection_matches[]` ids (when set) resolve to real Objection Library items.
9. Non-vacuity: break a criterion (drop evidence span / drop `why_points_lost`) →
   validator fails → revert.

---

## 8. UI requirements (for the future Call Review day, Day 268)

Additive to `/calls/[id]`; must degrade gracefully for v1-only rows.

- **Stage card** (existing) gains an expandable **criteria list**.
- **Criterion row:** label · status chip (pass/partial/fail/not-observed) · score ·
  weight/emphasis marker.
- **Evidence:** the verbatim quote with a **jump-to-timestamp** control (uses
  `start_sec`) and speaker label.
- **Point-loss reason:** `why_points_lost` + `points_lost` shown inline; the stage's
  "points lost" is the itemised sum of its criteria.
- **Coaching action** per criterion + an **Assign drill** action (reuses the
  existing assignment/objection→assignment flow).
- **Confidence + degraded-score banner:** a clear, calm banner when
  `degraded_score` is true ("Provisional score — full transcript / live model
  needed"), and a confidence indicator otherwise.
- **Objection matches** surfaced with a link into the Objection Library.
- **v1 fallback:** rows without `criteria[]` render exactly as today (no regression).

---

## 9. Storage / migration decision

**Prefer no DB schema migration initially.** The v2 object fits inside the existing
JSON columns:

- Persist the full v2 object under `analysis_json.v2` (and/or `rubric._meta.v2`
  provenance), leaving the v1 top-level `analysis_json.stages` / `rubric` shape in
  place as the projection. Existing readers see v1; v2-aware readers opt into
  `analysis_json.v2`.
- `score_cache` needs no schema change — only the key/version bumps of §6.
- **When a dedicated `score_details` table may be needed (future):** if we later
  want per-criterion querying/aggregation (e.g. "worst criterion across the team",
  criterion-level trend, manager calibration analytics), a normalised
  `score_details(call_id, criterion_id, stage, status, score, weight, points_lost)`
  table becomes worthwhile. That is a **separate migration day**, explicitly out of
  scope now, and additive (the JSON remains the source of truth until then).
- **Manager override/comment** (Day-263 gap #14) similarly lands later as its own
  additive store (e.g. `score_overrides`), not in this contract body.

---

## 10. Day 265 hand-off

The contract is the input to **Day 265 — Golden Call Dataset**: a small set of
calls with human-authored expected `criteria[]` (status + evidence spans) in this
exact v2 shape, which the Day 266 harness scores against. Nothing in Days 264–266
changes runtime scoring; the first behaviour change is Day 267 (criteria-level
runtime output behind the v2 prompt/cache version).
