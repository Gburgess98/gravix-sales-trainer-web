# Objection Library — Field Specification & Data Entities (Day 210)

Status: **Design documentation only.** Exact MVP fields and the logical
data model. UX: `OBJECTION_LIBRARY_BLUEPRINT.md`. Scenario fields:
`SPARRING_SCENARIO_ENGINE_SPEC.md`.

Conventions match Days 208–209: examples are **UFC Gyms demo org** values
(placeholder text + Day-216-style seed content); "Effect" is the honest
basis for UI helper copy. All fields optional unless marked; approval (not
saving) is the completeness gate.

---

## 1. Objection item fields

| Field | Key | Type | Required | Helper copy | Example | Effect |
|---|---|---|---|---|---|---|
| Objection | `label` | text | **Yes** | The pushback in the buyer's words, as a quote. | "It's too expensive" | The item's identity everywhere: list, call-review chips, sparring briefs, assignments. |
| Buyer language | `buyer_phrases` | list of text | No | Other ways buyers say the same thing. One phrase per line. | "That's a lot per month" · "I can't justify that right now" · "PureGym is half that" | Sharpens matching (via the linked trigger) and suggestion merging; shown to reps so they recognise the moment. |
| Category | `category` | select | Yes (default Other) | Where this objection lives. Options: `Pricing · Stall · Competitor · Authority · Need · Trust · Other` | Pricing | List grouping/filtering and analytics rollups. Fixed list in MVP — no custom categories. |
| Why it matters | `why_it_matters` | longtext | No | One paragraph: what's really behind this objection and what's at stake. | Price pushback on tours is usually value doubt, not budget — members who join after a goal-anchored reframe retain longer than discounted joins. | Frames the coaching; shown at the top of drill briefs. |
| Approved response | `approved_response` | longtext | **To approve** | The benchmark answer, written as a rep would say it aloud. | "Compared to what you'd pay per class elsewhere, it's under £3 a visit — including coaching. What would make the first month worth it for you?" | The standard scoring and sparring judge against; quoted in coaching notes. An item cannot be approved without it. |
| Weak responses | `weak_responses` | list of longtext | No | The patterns you want coached away, one per entry. | Offering the discount immediately · Agreeing it's expensive and pivoting to the cheaper tier | Named anti-patterns — recognised in sparring fail signals and called out specifically in coaching. |
| Coaching note | `coaching_note` | longtext | No | What the rep should read before practising this — your voice. | Don't defend the price. Anchor their goal first, then price against the goal, not against other gyms. | Quoted verbatim in assignment briefs and post-sparring feedback. |
| No-go language | `no_go_language` | taglist | No | Anything reps must never say when handling this. Advisory, as in the Context Engine. | "guaranteed results" · "I'll get you a special deal" | Informs sparring fail signals and coaching notes; not an automated compliance monitor (same caption as Day 208). |
| Linked criterion | `scorecard_criterion_ref` | reference (scorecard + criterion id) | No | The scorecard criterion this objection tests, if any. | Discovery Call — UFC v2 → "Reframed price against the member's goal" | Chip on both sides (item detail ↔ criterion card); lets analytics connect criterion failures to this item. Reference only in MVP — no behavioural coupling. |
| Linked trigger | `whisperer_trigger_id` | reference | No | The trigger that detects this objection on calls, if one exists. | Custom trigger: price pushback | MVP matching path: calls where this trigger fires count as evidence/frequency and show the library chip. |

System fields: `status` (`draft · approved · archived`), `source`
(`manual · suggested · call_review`), `created_by`, `approved_by/at`,
`created_at`, `updated_at`. Frequency/trend are **computed** (evidence
matches over trailing 30/90 days), never stored manager-editable numbers.

## 2. Suggestion (review queue) fields — computed, not persisted until actioned

| Field | Meaning |
|---|---|
| `suggested_label` | Representative buyer phrase from clustered evidence |
| `sources` | Detectors that produced it: `moments · triggers · blended` |
| `evidence` | Call excerpts: call id, timestamp, excerpt, rep, date (links to `/calls/[id]`) |
| `frequency`, `rep_spread`, `window` | e.g. 9 calls · 4 reps · 30 days |
| `confidence` | `High` = ≥6 calls **and** ≥3 reps in 30 days; `Medium` = everything else surfaced (floor: ≥3 calls). Deterministic and documented in-UI ("based on how often and how widely this appears") — no black-box score. |

Persisted only as a **decision row** on action (mirrors
`whisperer_trigger_candidate_decisions`): approve-as-draft (with created
item id), merge (with target item id), dismiss — all restorable with
history.

## 3. Data entities (logical model; MVP storage noted honestly)

```
objection_library_items            (table, MVP)
  id, company_id, label, buyer_phrases jsonb, category,
  why_it_matters, approved_response, weak_responses jsonb,
  coaching_note, no_go_language jsonb,
  scorecard_criterion_ref jsonb null,   -- {scorecard_id, version, criterion_id}
  whisperer_trigger_id null,
  status, source, created_by, approved_by, approved_at,
  created_at, updated_at

objection_evidence                 (table, MVP)
  id, company_id, item_id → objection_library_items,
  call_id, timestamp_sec null, excerpt, rep_id null,
  source (suggestion|manual|moment_match), created_at

objection_suggestion_decisions     (table, MVP — the candidate-decisions
  id, company_id, suggestion_key,   pattern reused: suggestion identity is
  action (approved|merged|dismissed),   a stable content hash, as with
  item_id null, decided_by, decided_at, restored_at null   trigger candidates)

objection_response_guides          (LOGICAL, phase 2)
  -- Multiple guides per item (by persona/segment). MVP stores the single
  -- approved_response + weak_responses ON the item; this table exists
  -- when multi-guide ships. Defined now so nobody nests guides into
  -- jsonb in a shape that can't be promoted later.

sparring_scenarios / sparring_scenario_versions
  -- see SPARRING_SCENARIO_ENGINE_SPEC.md §4 (scenarios belong to items)

assignment_links                   (LOGICAL, phase 2)
  -- assignment ↔ item ↔ scenario_version join. MVP rides the existing
  -- assignments.meta pattern (Day 155 proof precedent):
  --   meta: { objection_item_id, scenario_id, scenario_version }
  -- Promoted to a table when analytics needs indexed joins.
```

All tables `company_id`-scoped with the existing org-scope middleware; no
cross-org reads anywhere, including suggestion mining (company's own calls
only).

## 4. Matching contract (MVP — how a call links to an item)

1. **Trigger path (primary):** item has `whisperer_trigger_id` → calls
   where that trigger fires show the library chip on the moment and count
   toward frequency/evidence.
2. **Suggestion path:** evidence attached when a suggestion is approved or
   merged.
3. **Manual path:** manager attaches a call from the detail page.

No new NLP in MVP. Items without a linked trigger simply show
suggestion/manual evidence only — stated in the UI ("Link a trigger to
count this automatically on new calls").

## 5. Validation rules (server-enforced)

1. `label` required to save; unique per company (case-insensitive).
2. `approved_response` required to move draft → approved.
3. Category from the fixed list; `critical`-style flags don't exist here —
   items carry no scoring weight themselves (that's the scorecard's job).
4. Archive keeps all children (evidence, scenarios, decisions) readable;
   restore returns to draft.
5. Merge only into non-archived items.
6. Company-scoped reads/writes; suggestion mining company-scoped.
