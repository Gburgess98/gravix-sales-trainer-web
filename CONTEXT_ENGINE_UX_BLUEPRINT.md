# Context Engine — UX Blueprint (Day 208)

Status: **Design documentation only.** No routes, components, or backend
exist yet. Builds on `CONTEXT_ENGINE_SPEC.md` (module spec, Day 207) and
`INTELLIGENCE_LAYER_BLUEPRINT.md`. Companion docs:
`CONTEXT_ENGINE_FIELD_SPEC.md` (exact fields),
`CONTEXT_ENGINE_ROUTE_PLAN.md` (where it lives, nav wiring plan).

---

## 1. Product intent

The Context Engine is where a manager **teaches Gravix how their company
sells**. The experience should feel like editing the company's business
memory — calm, guided, and always transparent about what the AI will do
with each answer. It is a setup workspace, not a wizard and not a chatbot.

**Desired feel:** premium AI setup workspace · calm and simple · guided but
not childish · manager-first · clearly shows what the AI will use · explicit
draft/published lifecycle · no fake automation · no scary technical language
· dark Gravix Command Centre native.

**Design principles (derived from competitor research — principles only, no
layout/wording/theme copied):**

1. **Show the AI's homework.** Every module states plainly what Gravix uses
   it for ("Used when scoring objection handling"). A "View as the AI sees
   it" preview shows the exact compiled context block. No hidden context.
2. **Editable, never automatic.** Nothing reaches live scoring without the
   manager pressing Publish. Drafts are visibly inert.
3. **Partial is fine.** Every field is optional. The UI rewards progress
   (context strength meter) instead of blocking on completeness.
4. **Business language only.** "Teach Gravix", "used for scoring", "draft",
   "published" — never "prompt", "embedding", "token", "LLM".
5. **One calm page.** Module rail + editor, not a multi-step wizard. A
   manager can finish in 15 minutes or drop in monthly to update one line.

---

## 2. Page anatomy

Lives at `/intelligence?tab=context` (see `CONTEXT_ENGINE_ROUTE_PLAN.md`).
Everything below uses existing primitives: `PageContainer`, `PageHeader`,
`WorkspaceTabs`, `SectionCard`/`SectionHeader`, `Button`, `EmptyState`,
`StatusBadge` — dark shell, 1400px clamp, Day 203 semantic tokens.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ PageHeader  Intelligence                                                 │
│             Teach Gravix how {Company} sells.            [View as AI ▸]  │
│ WorkspaceTabs   Context ●   Scorecards                                   │
├────────────┬──────────────────────────────────────────┬─────────────────┤
│ MODULE RAIL│  EDITOR PANEL                            │ GUIDANCE PANEL  │
│            │                                          │                 │
│ ✓ Company  │  SectionCard: Common objections          │ Why this matters│
│   profile  │  ┌────────────────────────────────────┐  │ Gravix uses your│
│ ✓ Products │  │ Objection: "It's too expensive"    │  │ objections to   │
│   & services│ │ Approved response:  [textarea]     │  │ judge how reps  │
│ ○ Pricing &│  │ Weak response:      [textarea]     │  │ handle pushback │
│   position │  │ Notes:              [textarea]     │  │ and to write    │
│ ● Objections│ │                        [Remove]    │  │ coaching advice │
│   & responses│└────────────────────────────────────┘  │ in your words.  │
│ ○ Competitors│ [+ Add objection]                      │                 │
│ ○ Compliance│                                         │ Writing tips    │
│ ○ Tone &   │                                          │ · One objection │
│   coaching │                                          │   per entry     │
│            │                                          │ · Write the     │
│            │                                          │   response as a │
│            │                                          │   rep would say │
│            │                                          │   it aloud      │
├────────────┴──────────────────────────────────────────┴─────────────────┤
│ PUBLISH STRIP (sticky footer)                                            │
│ ● Draft — not yet used for scoring · Context strength: Basic             │
│ Last published v2, 3 Jul · 2 sections changed          [Publish changes] │
└──────────────────────────────────────────────────────────────────────────┘
```

### Module rail (left)
- Seven modules (see §3), vertical list, sticky. Each row: completeness
  mark (✓ has content · ○ empty · ● currently open), label.
- Selecting a module swaps the editor panel content (deep-linkable:
  `?tab=context&module=objections`).
- Below the modules: a compact **context strength** meter — `Empty · Basic ·
  Strong` — driven by how many modules have content (rules in
  `CONTEXT_ENGINE_FIELD_SPEC.md` §3). Informational, never blocking.
- ≤ md screens: rail collapses to horizontal scrollable chips above the
  editor; guidance panel folds into a per-module "Why this matters"
  disclosure under the editor heading.

### Editor panel (centre)
- One module at a time, one `SectionCard`. Plain labelled fields, helper
  text under each label, worked example as placeholder text (never
  pre-filled values).
- List modules (objections, competitors, offerings) are repeatable entry
  cards with **+ Add** / Remove; new entries expand inline — no modals.
- **Autosave to draft** on blur/debounce with a quiet "Saved just now"
  timestamp in the SectionCard header. No manual save button; Publish is
  the only ceremonial action.

### Guidance panel (right)
- **Static, honest content** per module — this is not an AI assistant:
  1. *Why this matters* — one short paragraph on what Gravix uses the
     module for, in scoring/coaching terms.
  2. *Writing tips* — 2–3 bullets.
  3. *Example* — one worked example entry (matches the field spec examples).
- Rendered from a copy map in code; no network calls, nothing generated.

### "View as the AI sees it" (header action)
- Opens a right-side drawer showing the **compiled context block** built
  client-side from the current draft — the same deterministic compilation
  rules the runtime will use (section order, empty sections omitted,
  truncation note when a list exceeds the cap).
- Two toggle chips at the top: **Draft** / **Published vN** (published view
  reads the last published payload). This single feature carries most of the
  transparency principle and is entirely real — no fake AI.

### Publish strip (sticky footer)
Always visible; the single source of lifecycle truth. Three states in §4.
Contents: status dot + phrase, context strength, last-published summary,
changed-section count, primary **Publish changes** button (brand/indigo,
manager-gated).

---

## 3. Modules (task sections → UX modules → storage)

The eleven MVP sections map onto seven editor modules; storage groups are
unchanged from Day 207 (`company_context` jsonb columns):

| # | UX module | Covers (task sections) | Storage |
|---|-----------|------------------------|---------|
| 1 | Company profile | company profile · sales motion · ICP/buyer profile | `profile` |
| 2 | Products & services | products and services | `offering.products_services` |
| 3 | Pricing & positioning | pricing and positioning | `offering.pricing_positioning` |
| 4 | Objections & responses | common objections · approved responses | `objections` |
| 5 | Competitors | competitors | `competitors` |
| 6 | Compliance & no-go | compliance / no-go language | `compliance` |
| 7 | Tone & coaching style | tone and coaching style | `tone` |
| — | Publish/review state | publish/review state | status strip + drawer (not a form module) |

Exact fields, helper copy, examples, and scoring effects:
`CONTEXT_ENGINE_FIELD_SPEC.md`.

---

## 4. Lifecycle states

### A. Empty (first run — nothing ever saved)
- Editor area replaced by a full-width `EmptyState`-style hero inside a
  SectionCard:
  - Heading: **"Teach Gravix how {Company} sells."**
  - Sub: "Right now, calls are scored with Gravix's general sales
    knowledge. Add your company's context and every score, coaching note
    and drill becomes specific to how you sell."
  - Primary CTA: **Start with your company profile** (opens module 1).
  - Quiet secondary line (future, disabled-free — simply absent in MVP):
    the AI Autofill entry point will live here later (§7).
- A subtle info banner (not a warning — nothing is wrong):
  "Scoring is using the Gravix default context."
- Module rail visible with all ○ marks so the scope of the job is scannable.

### B. Draft (content saved, never published / edited since last publish)
- Publish strip: `● Draft — not yet used for scoring` (neutral dot).
  If previously published: `Last published v2 on 3 Jul · 2 sections changed
  since` + **Publish changes**.
- Draft edits are autosaved and visibly inert: the strip wording is the
  guarantee that a half-finished draft never leaks into live scoring.

### C. Published and current (no draft changes)
- Publish strip: `● Published v3 — used for scoring new calls` (success
  dot) · "Published 11 Jul by Dana" · Publish button hidden (nothing to
  publish).
- Module rail ✓ marks reflect published content.

### Publish flow (B → C)
1. **Publish changes** opens a confirmation dialog — the review/approval
   moment:
   - "Publish context v3?"
   - Changed sections listed by name ("Objections & responses · Pricing &
     positioning") — section-level, not a field diff, in MVP.
   - Consequence copy, verbatim rule: **"New calls will be scored with
     this context. Existing calls and scores are unchanged."**
   - Buttons: Cancel · **Publish** (manager-gated; reps never see the strip
     in an actionable state — see §6).
2. On success: strip flips to state C, toast "Context v3 published", audit
   activity written (runtime day).

### Missing-context signals (calm, never nagging)
- In-workspace only for MVP: ○ marks in the rail + context strength meter +
  the state-A info banner.
- One planned external surface (runtime day, documented here so the copy is
  agreed): call review shows a quiet caption when a call was scored without
  published context — "Scored with Gravix default context" — linking to
  `/intelligence?tab=context`. No red, no alarm; absence of context is the
  normal starting state, not an error.

---

## 5. Manager workflow (end to end)

| Scenario | Experience |
|---|---|
| First-time setup | Empty state → Start with company profile → work down the rail (any order, any completeness) → strip shows Draft throughout → Publish → v1 live |
| Editing later | Open module → edit → autosave → strip shows "N sections changed" → Publish changes → v(n+1). Old calls untouched |
| Checking what's live | Strip shows version/date/author; **View as AI sees it → Published** shows the exact live text |
| Understanding impact | Per-module "Why this matters" + per-field "How this affects scoring" helper lines (field spec) |
| Default-context warning | State-A banner + (later) call-review caption, both linking here |
| Rep visiting | Read-only summary: profile + tone modules rendered as text, no editor, no publish strip actions (§6) |

---

## 6. Roles and guardrails (UX enforcement of Day 207 rules)

- **Manager+ only for editing/publishing.** Route is manager-gated like
  other Admin-group surfaces. If a rep ever reaches it: read-only summary
  view (no form fields, no strip actions) — trust through visibility,
  control through roles.
- **"AI uses this for scoring" transparency** — three redundant mechanisms:
  strip wording, per-module guidance panel, compiled-context drawer.
- **Draft never affects scoring** — stated in the strip in state B, and in
  the publish dialog by contrast.
- **Published version stamped into future calls; old calls never change
  retroactively** — the publish dialog's consequence copy carries this
  every single time; no "apply to history" option exists anywhere.
- **No cross-org leakage** — single-company workspace; the UI never offers
  templates from, comparisons with, or imports of other companies' context.
- **No fake automation** — the guidance panel is static copy; the compiled
  preview is a deterministic client-side render; there is no AI call
  anywhere in the MVP surface.

---

## 7. Future: AI Autofill from website (designed now, NOT built)

Phase 2 flow, documented so the MVP layout leaves room for it:

1. Entry point: empty state (state A) gains a secondary card — "Have a
   website? Let Gravix draft your context." URL input + **Draft from
   website**.
2. Progress state is honest ("Reading your site and drafting each
   section…"), cancellable.
3. Result lands **entirely in the draft state** — same editor, same rail.
   Each AI-filled field carries a small origin chip:
   - `AI draft` (confident) · `Check this` (low confidence / inferred).
   Editing a field clears its chip. Chips are review bookkeeping, not
   permanent metadata.
4. A review banner counts remaining `Check this` fields; publishing is
   allowed regardless (manager's call) but the count is visible in the
   publish dialog.
5. **Manager review is the only path to Publish — no auto-publish, ever.**
   Same publish dialog, same consequence copy.
6. Requires real fetch/enrichment infrastructure; until then no URL input
   is rendered at all. **No disabled buttons, no "coming soon" teasers.**

---

## 8. Copy deck (canonical strings, UK spelling)

| Where | Copy |
|---|---|
| Page sub | Teach Gravix how {Company} sells. |
| Empty hero sub | Right now, calls are scored with Gravix's general sales knowledge. Add your company's context and every score, coaching note and drill becomes specific to how you sell. |
| Default-context banner | Scoring is using the Gravix default context. |
| Draft strip | Draft — not yet used for scoring |
| Published strip | Published v{n} — used for scoring new calls |
| Changed hint | {n} section(s) changed since v{n−1} |
| Publish dialog consequence | New calls will be scored with this context. Existing calls and scores are unchanged. |
| Publish success toast | Context v{n} published |
| Preview drawer title | What the AI sees |
| Call-review caption (later) | Scored with Gravix default context / Scored with {Company} context v{n} |

Tone rules: no exclamation marks, no emoji, no "magic"/"supercharge"
language, no technical jargon. Verbs managers use: teach, publish, update.

---

## 9. Prototype policy

- MVP build order and route wiring: `CONTEXT_ENGINE_ROUTE_PLAN.md`.
- If a static visual prototype is wanted before the data layer exists, it
  must live at `/dev/context-engine-preview` (dev-only convention, like
  `/dev/audio-test`), hard-coded props, never linked from nav, and deleted
  when the real page lands. **No prototype was built on Day 208** — the
  ASCII anatomy in §2 plus the field spec is the build reference.

## 10. Out of scope for MVP (UX-level)

- AI Autofill (§7) — designed only.
- Field-level diff view between versions (section-level change list only).
- Version history browser (versions are stored server-side from day one;
  the strip shows only current + last published).
- Per-office context overrides; multi-language context.
- Any nudge/notification machinery about incomplete context.
