# Scorecard Studio — UX Blueprint (Day 209)

Status: **Design documentation only.** No routes, components, backend, or
runtime changes exist yet. Builds on `SCORECARD_STUDIO_SPEC.md` (module
spec, Day 207) and pairs with the Context Engine UX (Day 208). Companion
docs: `SCORECARD_STUDIO_FIELD_SPEC.md` (exact fields),
`SCORECARD_STUDIO_ROUTE_PLAN.md` (routes/deep links),
`AI_SCORECARD_BUILDER_SPEC.md` (draft-only AI flow, built later).

---

## 1. Product intent

Scorecard Studio is where a manager defines **what a good call looks like**
— per call type — and stays in control of every number Gravix produces.
If the Context Engine teaches Gravix the business, the Studio teaches it
the standard: *Context teaches Gravix how you sell; scorecards teach Gravix
what good looks like.*

**Desired feel:** premium scoring control room · detailed but not
overwhelming · manager-first · confident and clean · no spreadsheet chaos ·
no arcade · no fake automation · clear versioning · clear "what the AI will
look for" · dark Gravix Command Centre native.

**Principles (extracted from competitor research — principles only; no
layout, wording, or scorecard UI copied):** detailed criteria beat vague
ratings; managers must edit and approve everything that scores a live call;
call types deserve different standards; AI assists setup but never
publishes.

### The one constraint that shapes everything

The scoring runtime and every WEB consumer hard-code four stages —
**Intro, Discovery, Objection, Close** (strict JSON schema in
`api/src/lib/scoring.ts`; stage renderers in `/calls/[id]`, dashboard, rep
memory, drill mapping). **MVP scorecards customise weights, criteria,
pass/fail flags and coaching guidance *within* those four stages.**
Arbitrary custom sections are Phase 2 and the UX below deliberately gives
stages a fixed, unmovable frame — no "add stage" affordance exists, so the
constraint reads as design, not as a missing feature.

---

## 2. Studio home — scorecard list (`/intelligence?tab=scorecards`)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ PageHeader  Intelligence                                                 │
│             Teach Gravix how {Company} sells.                            │
│ WorkspaceTabs   Context    Scorecards ●                                  │
├──────────────────────────────────────────────────────────────────────────┤
│  Scorecards                                   [New scorecard]            │
│  Define what a good call looks like, per call type.                      │
│                                                                          │
│  ┌────────────────────────────┐  ┌────────────────────────────┐          │
│  │ Discovery Call — UFC       │  │ Renewal Saves              │          │
│  │ ● Active v2 · Discovery    │  │ ● Draft · Renewal/upsell   │          │
│  │ 12 criteria · edited 8 Jul │  │ 9 criteria · created 11 Jul│          │
│  └────────────────────────────┘  └────────────────────────────┘          │
│                                                                          │
│  ┌────────────────────────────┐                                          │
│  │ Gravix Default    read-only│                                          │
│  │ ● Active fallback · All    │                                          │
│  │   call types without a     │                                          │
│  │   custom scorecard         │                                          │
│  └────────────────────────────┘                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

- Card contents: name · status chip (`Active v{n}` success / `Draft`
  neutral / `Archived` muted) · call-type chips · criteria count · last
  edited. Click opens the editor (deep link `&scorecard=<id>`).
- **Gravix Default** always renders as a read-only card, visually quieter,
  explaining the fallback in one line. Opening it shows the default rubric
  in the same editor layout, read-only — managers see exactly what scoring
  does before they customise anything. It cannot be edited, archived, or
  deactivated.
- **Coverage strip** above the cards: six call-type chips, each showing
  which scorecard covers it ("Discovery → Discovery Call — UFC v2", others
  "→ Gravix Default"). This answers the manager's real question — *what
  happens when my rep's call gets scored?* — at a glance.
- Empty state (no custom scorecards): the Default card plus an
  `EmptyState`-style hero — "Every call is currently scored with the Gravix
  default scorecard. Create your own to define what good looks like for
  your team." CTA: **New scorecard**.
- **Archived** section collapsed at the bottom (count + expand); archived
  cards are read-only with a Restore action (restores as draft).
- The **Draft with AI** entry point appears here only when the AI Builder
  ships (`AI_SCORECARD_BUILDER_SPEC.md`) — until then it simply isn't
  rendered. No disabled buttons, no teasers.

---

## 3. Editor (`&scorecard=<id>` — full workspace takeover)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ← All scorecards                                                         │
│ Discovery Call — UFC          ● Draft v3 (editing)      [What AI looks   │
│ Applies to: Discovery call                                for ▸]         │
├────────────┬──────────────────────────────────────────┬─────────────────┤
│ STAGE RAIL │  STAGE EDITOR — Discovery (35%)          │ GUIDANCE PANEL  │
│            │                                          │                 │
│ Overview   │  Stage weight  [ 35 ]%                   │ Why this stage  │
│            │                                          │ matters         │
│ Intro  10% │  Criteria (5)                            │ Discovery is    │
│ Discov 35% │  ┌────────────────────────────────────┐  │ where the AI    │
│  ● open    │  │ Asked about training goals before  │  │ judges question │
│ Object 30% │  │ pitching                           │  │ quality and     │
│ Close  25% │  │ Emphasis: Major · Pass/fail ·      │  │ buyer fit…      │
│ ────────── │  │ Critical                    [Edit] │  │                 │
│ Weights    │  └────────────────────────────────────┘  │ Writing a good  │
│ total 100 ✓│  │ Uncovered current routine …        │  │ criterion       │
│            │  │ Emphasis: Standard          [Edit] │  │ · observable on │
│ Versions   │  └────────────────────────────────────┘  │   a transcript  │
│            │  [+ Add criterion]                       │ · one behaviour │
│            │                                          │   per criterion │
├────────────┴──────────────────────────────────────────┴─────────────────┤
│ ● Draft v3 — not scoring live calls · Last active v2, 3 Jul              │
│                                    [Archive]  [Activate v3]              │
└──────────────────────────────────────────────────────────────────────────┘
```

Same three-panel grammar as the Context Engine (rail / editor / static
guidance) so the workspace feels like one product. Autosave-to-draft on
blur; the activation strip is the only ceremonial control.

### Stage rail (left)
- **Overview** (name, description, call-type assignment) then the four
  fixed stages in scoring order, each showing its current weight. No
  reorder, no add, no remove — the frame is part of the product.
- Live **weights total** indicator under the stages: `Weights total 100 ✓`
  or `Weights total 90 — 10 to assign` (warning tone, blocks activation
  only, never editing).
- **Versions** entry at the bottom opens version history (§5).

### Stage editor (centre)
- Stage weight input (integer %) at the top with the live total beside it.
- Criteria as compact cards: label, chips for Emphasis
  (`Minor · Standard · Major`), `Pass/fail`, `Critical` (only on pass/fail
  criteria). **Edit** expands the card inline into the criterion form
  (fields in `SCORECARD_STUDIO_FIELD_SPEC.md`): description, scoring
  guidance, coaching prompt, example good/bad behaviours.
- **+ Add criterion** appends an expanded blank card. Suggested cap ~8 per
  stage with a gentle nudge ("Long checklists dilute scoring — aim for the
  behaviours that decide the stage"), soft limit 12.
- Deleting a criterion is allowed freely in drafts (it's what versioning
  is for).

### Guidance panel (right)
Static copy per stage (not an AI assistant): why the stage matters to
scoring, what makes a good criterion (observable on a transcript, one
behaviour each, written as the manager would say it to a rep), and one
worked example criterion. Collapses into a disclosure under the stage
heading below xl, matching the Context Engine breakpoints.

### "What the AI looks for" (header action)
The Studio's version of the Day 208 transparency drawer: a deterministic,
client-side rendering of the scorecard as the runtime will consume it —
stages with weights, criteria with emphasis/pass-fail/critical markers and
scoring guidance, in fixed order. Toggle chips: **Draft vN** / **Active
vN**. Real rendering of real data; no AI call.

---

## 4. Lifecycle states

```
Draft (v1, never activated)
  └─(Activate — manager approval)─▶ Active v1
Active v1 ──(any edit)──▶ Active v1 + Draft v2   (strip: "editing draft v2")
  └─(Activate v2)─▶ Active v2 (v1 → superseded, immutable)
Any state ──(Archive)──▶ Archived (read-only; call type falls back)
Archived ──(Restore)──▶ Draft v(n+1)
```

- **Draft** — strip: `● Draft v{n} — not scoring live calls`. Buttons:
  Activate v{n} (primary, disabled only while weights ≠ 100, with the
  reason shown inline — the one permitted "disabled" state because the fix
  is one field away) · Archive (quiet).
- **Active, no draft** — strip: `● Active v{n} — scoring {call types}
  since {date}`. Any edit silently forks Draft v{n+1} and the strip flips
  to editing state. Active versions are immutable rows; there is no
  in-place edit path (mirrors the Context Engine guarantee).
- **Activation confirmation** (the manager-approval moment):
  - "Activate Discovery Call — UFC v3?"
  - What changes: "New Discovery calls will be scored with v3."
  - Replacement notice when the call type is already covered: "Replaces
    Discovery Call — UFC v2 as the active scorecard for Discovery calls."
    (One active scorecard per call type; the server enforces it, the
    dialog explains it.)
  - The invariant, verbatim every time: **"Existing calls keep the
    scorecard version that scored them."**
  - Cancel · **Activate** (manager-gated).
- **Archive confirmation:** "Archive Discovery Call — UFC?" · "Discovery
  calls will fall back to the Gravix default scorecard. Calls already
  scored with this scorecard are unchanged, and its versions remain
  viewable." Archive never deletes versions — historical scoring context
  is permanent.

## 5. Version history

Read-only list (rail → Versions): `v3 · Draft · edited 11 Jul` / `v2 ·
Active · activated 3 Jul by Dana` / `v1 · Superseded · active 12 Jun–3 Jul
· origin: AI draft`. Each row opens that version read-only in the editor
layout with a header banner ("Viewing v1 — superseded"). MVP has **no
field-level diff** and no rollback button; restoring an old standard =
duplicate an old version into a new draft (explicit, auditable). Origin
(`manual · AI draft · duplicate`) and approver are always shown — provenance
is part of trust.

## 6. Call-type assignment (Overview section)

- Six fixed call types (labels and keys in the field spec): outbound cold
  call · inbound enquiry · discovery call · demo call · objection-heavy
  call · renewal/upsell call.
- Multi-select chips on the scorecard Overview. A chip already covered by
  another active scorecard shows its current owner ("Demo — currently
  Demo Standard v1"); selecting it is allowed, and activation resolves the
  handover explicitly in the confirmation dialog.
- "All call types (company default)" is a separate single toggle — a
  company-default scorecard covers any type without a specific one, sitting
  between typed scorecards and the Gravix default in the fallback chain.
- Where the call type comes from: set at `/upload` (call context step);
  the coverage strip (§2) shows the consequence of every assignment.

## 7. Runtime integration and transparency (design contract)

Per `SCORECARD_STUDIO_SPEC.md`; restated here as the UX contract:

- **Resolution:** active version for (company, call type) → company-default
  scorecard → Gravix default rubric v1 (today's exact behaviour). A broken
  custom path falls back rather than failing the job.
- **Stamping:** `scorecard_id` + `scorecard_version` written into
  `calls.rubric._meta` (which already carries `rubric_version` /
  `model_version`) and the `call_scores` history row.
- **Call review caption:** `/calls/[id]` shows a quiet caption by the score
  header — "Scored with Discovery Call — UFC v2" linking to that version
  read-only, or "Scored with Gravix default scorecard" linking to the
  Studio. Rendered from `_meta`; older calls without stamps show the
  default caption. This is the rep-facing half of trust: everyone can see
  which standard produced the number.
- **History never rewrites:** activating a version affects new calls only;
  re-scoring an old call is a separate explicit action out of MVP scope.

## 8. Safety and product rules (UX enforcement)

- **No activation without manager approval** — the confirmation dialog is
  the approval; there is no other path to `active`, including for AI drafts.
- **No arbitrary sections in MVP** — no add/remove/reorder affordance on
  stages anywhere, including the AI Builder output.
- **Weights must total 100** — live indicator while editing; hard gate at
  activation with the shortfall named.
- **No cross-org access** — single-company Studio; no shared templates,
  no cross-company duplication, nothing to browse from other orgs.
- **Archive preserves history** — versions remain readable forever;
  historical call stamps resolve to archived versions without special
  cases.
- **Reps** get read-only visibility (the call-review caption and read-only
  version view), never the editor.

## 9. Copy deck (canonical strings, UK spelling)

| Where | Copy |
|---|---|
| Tab sub-heading | Define what a good call looks like, per call type. |
| Empty state | Every call is currently scored with the Gravix default scorecard. Create your own to define what good looks like for your team. |
| Draft strip | Draft v{n} — not scoring live calls |
| Active strip | Active v{n} — scoring {call types} since {date} |
| Weights warning | Weights total {t} — {100−t} to assign |
| Activation consequence | New {call type} calls will be scored with v{n}. Existing calls keep the scorecard version that scored them. |
| Replacement notice | Replaces {name} v{m} as the active scorecard for {call type} calls. |
| Archive consequence | {call types} calls will fall back to the Gravix default scorecard. Calls already scored with this scorecard are unchanged. |
| Call review caption | Scored with {name} v{n} · Scored with Gravix default scorecard |
| Default card line | Scores any call type without a custom scorecard. |

Tone rules match Day 208: no exclamation marks, no emoji, no jargon
("criterion", "weight", "version" are fine — managers use these words;
"schema", "prompt", "LLM" are not).

## 10. Out of scope for MVP (UX-level)

- AI Scorecard Builder (separate spec; ships after the manual editor and
  is draft-only by design).
- Custom stage structures, stage renaming, per-criterion numeric weights
  (emphasis levels instead — see field spec).
- Field-level version diffs; rollback-in-place; bulk re-scoring.
- Scorecard performance analytics ("calls scored", average by version).
- Import/export, per-office scorecards, cross-scorecard criterion library.
- Any Studio surface for editing while viewing a superseded version.
