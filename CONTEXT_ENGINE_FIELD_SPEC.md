# Context Engine — Field Specification (Day 208)

Status: **Design documentation only.** Exact MVP fields for the Context
Engine editor. Layout/states: `CONTEXT_ENGINE_UX_BLUEPRINT.md`. Storage
groups match `company_context` in `INTELLIGENCE_LAYER_BLUEPRINT.md` §6 —
nothing here changes the Day 207 data model.

Conventions:
- **Every field is optional.** Publish is never blocked on completeness;
  the context strength meter (§3) rewards progress instead.
- All examples below are the **UFC Gyms demo org** values — they double as
  the Day 216 seed content. Examples render as placeholder text only, never
  as pre-filled values.
- "Effect" = the honest answer to "how does this change scoring/coaching?",
  and is the basis for the per-field helper line in the UI.
- Types: `text` (single line), `longtext` (textarea), `select`,
  `taglist` (chip input), `list<…>` (repeatable entry cards).

---

## Module 1 · Company profile — storage `profile`

| Field | Key | Type | Helper copy | Example (placeholder) | Effect on scoring/coaching |
|---|---|---|---|---|---|
| About the company | `profile.about` | longtext | What does your company do, in two or three sentences? Write it how you'd tell a new starter. | UFC Gyms runs 12 UK sites selling gym memberships and personal-training packages. Most new members come through walk-ins and booked tours. | Grounds every AI summary and coaching note in the real business — the AI stops guessing what "the product" is. |
| Sales motion | `profile.sales_motion` | select + longtext notes | How do you sell? Pick the closest, then add anything unusual. Options: `Inbound-led` · `Outbound-led` · `Mixed` · `Walk-in / field` · `Partner-led` | Walk-in / field — tours are booked same-day; strong reps close a standard membership on the first visit. | Calibrates stage expectations — e.g. a one-visit close means a soft "call me back" is a weak close, not a normal multi-touch step. |
| Ideal customer (ICP) | `profile.icp` | longtext | Who is your ideal buyer? Who makes the decision? | Gym-curious 25–45 professionals living or working within 15 minutes of a site. The member decides for themselves — no committee. | Discovery is judged against the right buyer: questions that qualify this person score well; generic qualifying does not. |

## Module 2 · Products & services — storage `offering.products_services`

`list<offering>` — repeatable entries, **+ Add product or service**:

| Field | Key | Type | Helper copy | Example | Effect |
|---|---|---|---|---|---|
| Name | `name` | text | What the rep would call it on a call. | All-Access membership | AI recognises what was actually pitched and can tell offerings apart. |
| Description | `description` | longtext | One or two sentences — what it is and who it suits. | Every site, all classes included, no joining fee on 12-month terms. Suits members who travel between sites. | Lets scoring judge fit: pitching All-Access to a single-site buyer is a coachable moment, not a win. |

## Module 3 · Pricing & positioning — storage `offering.pricing_positioning`

| Field | Key | Type | Helper copy | Example | Effect |
|---|---|---|---|---|---|
| Pricing notes | `pricing.notes` | longtext | How is pricing communicated on a call? Include what reps must never do with discounts. | Standard £34.99/mo, All-Access £49.99/mo. Joining fee often waived in promos. Never discount PT sessions below package rates. | Price-objection handling is judged against your real rules — offering a forbidden discount becomes a flagged weak response instead of "handled the objection". |
| Positioning | `positioning.notes` | longtext | How do you want to be positioned against the market? What do you sell beyond the product? | Premium but accessible. We sell coaching and community, not floor space and machines. | Shapes what "good pitching" means in notes and suggestions — reps get coached towards your positioning, not generic value language. |

## Module 4 · Objections & responses — storage `objections`

`list<objection>` — repeatable entries, **+ Add objection**. This module is
the highest-value teaching surface and doubles as the MVP objection library
(dedicated Library UI is phase 2 — Day 207 blueprint §8).

| Field | Key | Type | Helper copy | Example | Effect |
|---|---|---|---|---|---|
| Objection | `objection` | text | The pushback in the buyer's words. One objection per entry. | "It's too expensive." | AI recognises the moment on real calls and scores the rep's handling of *this* objection, not pushback in general. |
| Approved response | `approved_response` | longtext | What a great response sounds like, written as a rep would say it aloud. | "Compared to what you'd pay per class elsewhere, the membership works out under £3 a visit — and that includes the coaching. What would you want to get out of the first month?" | The benchmark scoring judges against; quoted in coaching guidance when a rep handles it poorly. Later feeds drills and sparring scenarios. |
| Weak response | `weak_response` | longtext | What reps currently say that you want coached away. Optional. | Immediately offering a discount or the cheaper tier before defending value. | Named anti-pattern: the AI can call it out specifically rather than vaguely scoring the stage down. |
| Notes | `notes` | longtext | Anything else — when this comes up, which offers help. Optional. | Spikes every January; the class-pass comparison lands best. | Extra grounding for coaching notes. |

## Module 5 · Competitors — storage `competitors`

`list<competitor>` — repeatable entries, **+ Add competitor**:

| Field | Key | Type | Helper copy | Example | Effect |
|---|---|---|---|---|---|
| Name | `name` | text | Who you lose deals to. | PureGym | Competitor mentions on calls are recognised as competitive moments rather than noise. |
| What they pitch | `notes` | longtext | How they win against you. | Cheaper headline price, 24/7 access, no contract. No classes or coaching included. | Scoring understands the real trade-off the buyer is weighing. |
| How we win | `positioning` | longtext | The approved counter-position. | Acknowledge the price gap, then anchor on included classes and coaching — cheaper gyms cost more once you add classes. | When a rep flounders on a competitor mention, coaching quotes your approved counter — in your words. |

## Module 6 · Compliance & no-go — storage `compliance`

| Field | Key | Type | Helper copy | Example | Effect |
|---|---|---|---|---|---|
| No-go phrases | `compliance.no_go_language` | taglist | Words or claims reps must never use. One phrase per tag. | "guaranteed results" · "medical advice" · "cancel anytime" (we have 12-month terms) | **MVP: advisory.** Informs scoring criteria and coaching notes when a no-go phrase appears. Automated compliance flagging is phase 2 and the UI says so honestly — no implied enforcement. |
| Required disclosures | `compliance.required_disclosures` | list of text | Things reps must say in specific situations. | 14-day cooling-off period must be mentioned when signing a 12-month contract. | Same advisory basis: missed disclosures can appear in notes; hard enforcement waits for phase 2 accuracy work. |

Module-level caption (verbatim, sets expectations):
*"Gravix uses this to inform scoring and coaching notes. It is not an
automated compliance monitor."*

## Module 7 · Tone & coaching style — storage `tone`

| Field | Key | Type | Helper copy | Example | Effect |
|---|---|---|---|---|---|
| Playbook guidance | `tone.playbook_guidance` | longtext | The plays you want every rep running. Keep it to what you'd actually enforce. | Always book the tour before quoting price. First question on every tour: "what made you come in today?" | Becomes part of what "good" means in every stage — reps get scored and coached against your plays. |
| Tone & coaching voice | `tone.tone_notes` | longtext | How should reps sound — and how should coaching feedback be written? | Reps: direct, warm, no hard-sell scripts. Coaching: encouraging but specific — name the moment, quote the better line. | Sets the voice of AI notes and suggestions so feedback reads like your sales floor, not a generic bot. |

---

## 2. System fields (read-only in UI — publish strip / drawer)

| Field | Shown as |
|---|---|
| `status` (draft/active) | Strip state dot + phrase |
| `version` | "Published v3" |
| `published_at`, `updated_by` | "Published 11 Jul by Dana" |
| changed-sections-since-publish | "2 sections changed" (computed, section-level) |

## 3. Context strength meter (rail)

Deterministic, informational, never blocking:

- **Empty** — no module has content.
- **Basic** — Company profile has any content **and** at least 2 other
  modules have content.
- **Strong** — Company profile + Objections (≥2 entries with approved
  responses) + at least 4 modules with content in total.

A module "has content" when any of its fields is non-empty (lists: ≥1
entry with its primary field filled).

## 4. Compiled context block (preview + runtime contract)

Deterministic compilation, identical in the client-side preview drawer and
the runtime (Day 210):

1. Fixed section order: profile → products & services → pricing &
   positioning → objections → competitors → compliance → tone.
2. Empty sections omitted entirely — no "N/A" noise.
3. List caps (first N in saved order, no sampling — cache-safe):
   objections ≤ 12 · competitors ≤ 6 · offerings ≤ 10 · no-go phrases ≤ 20.
   The preview shows a truncation note when a cap bites.
4. Whole-block budget ≈ 1,500 tokens (per `CONTEXT_ENGINE_SPEC.md`);
   longtext fields soft-capped in the editor (character counter appears
   near the limit, ~800 chars) so truncation is rare rather than silent.
5. Empty context compiles to nothing → today's exact prompt (zero
   regression path).
