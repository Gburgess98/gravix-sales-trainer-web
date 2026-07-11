# Scorecard Studio — Field Specification (Day 209)

Status: **Design documentation only.** Exact MVP fields for the Studio
editor. Layout/states: `SCORECARD_STUDIO_UX_BLUEPRINT.md`. Storage matches
`scorecards` / `scorecard_versions` in `INTELLIGENCE_LAYER_BLUEPRINT.md` §6
(sections/criteria stored as the immutable jsonb snapshot on the version).

Conventions follow the Day 208 field spec: examples are **UFC Gyms demo
org** values (placeholder text only, and Day 216 seed content); "Effect" is
the honest basis for helper copy in the UI.

---

## 1. Scorecard (Overview section)

| Field | Key | Type | Required | Helper copy | Example | Effect |
|---|---|---|---|---|---|---|
| Name | `name` | text | **Yes** | How this scorecard appears on calls and reports. | Discovery Call — UFC | Shown in the "Scored with…" caption on every call it scores. |
| Description | `description` | longtext | No | What this scorecard is for and when it applies — written for your future self. | First-visit tours and booked discovery calls. Emphasises goal questions before any pitch. | List-card context and version-history context; not used in scoring. |
| Call types | `call_types` | multi-select chips | No* | Which calls this scorecard scores. Leave empty and switch on "All call types" to make it the company default. | Discovery call | Drives runtime resolution; the coverage strip shows the result. *At least one type or the company-default toggle is required to activate (not to save a draft). |
| Company default | `is_company_default` | toggle | No | Scores any call type that has no specific scorecard. One per company. | Off | Sits between typed scorecards and the Gravix default in the fallback chain. |

### Call types (fixed keys and labels)

| Key | Label |
|---|---|
| `outbound_cold` | Outbound cold call |
| `inbound_enquiry` | Inbound enquiry |
| `discovery` | Discovery call |
| `demo` | Demo call |
| `objection_heavy` | Objection-heavy call |
| `renewal_upsell` | Renewal / upsell call |

(Supersedes the Day 207 shorthand enum — same six types, manager-facing
labels; keys are stable storage values set at `/upload`.)

## 2. Stages (fixed frame — exactly four, never editable as structure)

| Field | Key | Type | Rule |
|---|---|---|---|
| Stage weight | `sections[stage].weight` | integer % | Each 0–100; **the four must total exactly 100** to activate. Editing is never blocked; activation is. 0 is legal (stage still scored and shown, contributes nothing to overall). |

Stage keys are fixed: `intro`, `discovery`, `objection`, `close` — matching
the runtime schema and every WEB consumer. Overall = weighted mean of stage
scores using these weights (replaces the model's own overall on custom
scorecards).

Gravix default for reference (read-only card): 25 / 25 / 25 / 25.
UFC example: Intro 10 · Discovery 35 · Objection 30 · Close 25.

## 3. Criterion (repeatable within a stage; suggested ≤8, soft cap 12)

| Field | Key | Type | Required | Helper copy | Example (UFC, Discovery stage) | Effect |
|---|---|---|---|---|---|---|
| Criterion | `label` | text | **Yes** | One observable behaviour, phrased as you'd say it to a rep. | Asked about training goals before pitching | The behaviour the AI looks for on the transcript; shown on call review when it fails. |
| Description | `description` | longtext | No | What counts and what doesn't — the boundary of this behaviour. | Any open question about what the member wants to achieve, before any membership or price talk. "Do you train much?" doesn't count — closed and historic. | Sharpens AI judgement; the boundary sentence is what stops criteria drifting. |
| Scoring guidance | `scoring_guidance` | longtext | No | How to rate it: what earns full credit, partial credit, none. | Full: goal question asked and answered before the pitch. Partial: asked but rushed past the answer. None: pitch started with no goal question. | Directly steers the stage score; the closest thing to "programming" the AI in manager language. |
| Emphasis | `emphasis` | select `Minor · Standard · Major` | Yes (default Standard) | How much this criterion moves the stage score relative to its siblings. | Major | Relative weighting within the stage (Minor 1× · Standard 2× · Major 3×) — deliberate levels, not a numeric spreadsheet. |
| Pass/fail | `pass_fail` | toggle | No (default off) | The AI records met / not met / unclear for this behaviour. | On | Failed pass/fail criteria appear as named misses on call review and feed review flags with `criterion_id`. |
| Critical | `critical` | toggle (only shown when pass/fail is on) | No | Failing this caps the stage score and flags the call for review. | On | Failing caps the stage at 40 and emits a review flag — feeds the existing flag → assignment machinery. |
| Coaching prompt | `coaching_prompt` | longtext | No | What the rep should read when they miss this — your voice, not the AI's. | Before you talk memberships, get one real goal out of them. "What made you come in today?" then shut up and listen. | Quoted verbatim in coaching notes and auto-created assignment notes when the criterion fails. |
| Good example | `example_good` | longtext | No | A line or moment that would earn full credit. | "What would you want to be different about your training three months from now?" | Grounds AI judgement; also shown to reps as the standard. |
| Bad example | `example_bad` | longtext | No | The behaviour you're coaching away from. | Quoting the All-Access price within the first two minutes, before any goal question. | Named anti-pattern the AI can recognise and call out specifically. |

## 4. Version metadata (system — read-only in UI)

| Field | Shown as |
|---|---|
| `version` | v3 |
| `status` (`draft · active · superseded`) | status chip / strip state |
| `origin` (`manual · ai_draft · duplicate`) | "origin: AI draft" in version history |
| `source_prompt` (AI drafts only) | viewable from version history ("View the prompt that drafted this") |
| `approved_by`, `approved_at` | "activated 3 Jul by Dana" |
| `created_at` | version history row |

Scorecard-level: `status` (`draft · active · archived`),
`active_version_id`, `created_by`, `created_at`.

## 5. Validation rules (server-enforced; UI mirrors them live)

1. Name required to save; unique per company (case-insensitive).
2. Stage weights: integers 0–100, total exactly 100 **to activate**.
3. At least one criterion overall to activate; a 0-weight stage may be
   criterion-empty.
4. At least one call type or company-default toggle to activate.
5. One active scorecard per call type and one company default — activation
   resolves conflicts explicitly (replacement notice in the dialog).
6. `critical` requires `pass_fail`.
7. Active/superseded versions immutable; edits fork a new draft version.
8. All reads/writes company-scoped (existing org-scope middleware).

## 6. Runtime consumption sketch (contract for the "What the AI looks for" drawer)

The drawer and the runtime render the same deterministic structure:

```
Stage: Discovery (weight 35%)
  Criterion (Major, pass/fail, critical): Asked about training goals before pitching
    What counts: …description…
    Rate it: …scoring_guidance…
    Good: …example_good…   Bad: …example_bad…
  Criterion (Standard): …
```

Fixed stage order; criteria in saved order; empty optional fields omitted.
Coaching prompts are **not** sent to the scoring model — they are what the
rep reads after; the drawer shows them dimmed with the caption "shown to
reps after scoring, not used to judge the call".
