# AI Scorecard Builder — Spec (Day 209)

Status: **Design documentation only. Built after the manual Studio editor,
and draft-only by design.** Part of the Intelligence Layer
(`INTELLIGENCE_LAYER_BLUEPRINT.md`); UX home is the Scorecard Studio
(`SCORECARD_STUDIO_UX_BLUEPRINT.md`). Nothing here exists in the product
until its build day, and until then **no entry point renders** — no
disabled buttons, no teasers.

## 1. Product intent

Most managers know exactly what a good call sounds like and have never
written a scoring rubric. The Builder closes that gap: the manager
describes the call in their own words, Gravix drafts a complete scorecard
— stages weighted, criteria written, coaching prompts included — and the
manager edits and approves it in the normal editor.

**The Builder is an accelerant for the editor, not an alternative to it.**
Principle (from competitor research, principle only): AI assists setup; it
never publishes. There is no path — including this one — where an AI
output scores a live call without a manager pressing Activate.

## 2. Flow

1. **Entry:** "Draft with AI" on the Studio list page (beside New
   scorecard), and as an option inside `mode=create`.
2. **One prompt panel** (not a chat):
   - Call type select (the fixed six).
   - Prompt textarea: *"Describe this call and what a great one sounds
     like. Mention anything you always want to hear — and anything you
     never want to hear."*
   - Example placeholder: "Renewal calls for gym members whose 12-month
     term is ending. A great call opens with their usage, surfaces
     cancellation risk early, and always offers the loyalty rate before
     they mention cancelling."
   - A quiet line states what else is used: "Gravix also uses your
     published company context to ground the draft." (If no context is
     published: "Publishing your company context first gives the AI much
     more to work with" — informational, not blocking.)
3. **Progress state** is honest and cancellable ("Drafting your
   scorecard…"). On failure: plain error, retry, nothing saved.
4. **Result: a normal draft version** opened in the normal editor —
   same rail, same criterion cards, same activation strip. A banner marks
   provenance: "AI draft — review before activating." There is no special
   AI mode, no separate review screen to learn.
5. Per-criterion origin chips (`AI draft`), cleared by editing that
   criterion — same bookkeeping pattern as the Context Engine Autofill
   design (Day 208 §7). The activation dialog shows the count of
   unreviewed AI criteria; activation is allowed regardless (manager's
   call), the count is just visible at the moment of approval.
6. **Activation is the standard manual gate** — identical dialog, identical
   consequence copy. Nothing about an AI draft changes the approval path.

## 3. What the AI drafts (contract)

Within the fixed frame only:
- The four fixed stages with proposed weights totalling 100.
- 3–6 criteria per relevant stage, each with: label, description, scoring
  guidance, emphasis, pass/fail + critical proposals, coaching prompt,
  good/bad examples — the full field spec (`SCORECARD_STUDIO_FIELD_SPEC.md`
  §3), so drafted criteria are indistinguishable in structure from manual
  ones.
- Grounded in the published company context (objections, playbook, tone)
  when available.
- **Never**: new stages, renamed stages, structures outside the schema.
  The generation contract is the same strict shape the editor edits.

## 4. Storage & audit (matches Day 207 data model — no additions)

- Lands as a `scorecard_versions` row: `status='draft'`,
  `origin='ai_draft'`, `source_prompt` stored verbatim.
- Version history shows "origin: AI draft" with "View the prompt that
  drafted this" — provenance is permanent and visible.
- Endpoint sketch: `POST /v1/intelligence/scorecards/ai-draft`
  (blueprint §7) — returns a draft version; it has no ability to write
  `status='active'`.

## 5. Guardrails

1. **Draft-only by construction** — the endpoint cannot activate; the UI
   has no combined "generate and activate" affordance.
2. **Same approval gate** — the manager who activates an AI draft sees the
   same consequence copy and the unreviewed-criteria count.
3. **Fixed-frame output** — malformed generations (wrong stages, weights
   ≠ 100) are corrected or rejected server-side before the draft is saved;
   the manager never sees a structurally invalid scorecard.
4. **Company-scoped grounding** — the draft uses only the caller's
   company context; no cross-org examples or templates.
5. **Honest failure** — if generation fails, nothing is created; no
   partial drafts, no silent retries.

## 6. Deferred beyond the Builder's first version

- Iterating on a draft conversationally ("make discovery stricter").
- Drafting from call recordings/transcripts ("build a scorecard from my
  best calls") — natural phase 2, pairs with Whisperer mining.
- Suggesting criteria edits on an existing active scorecard.
- Confidence scores per criterion (origin chips only in v1).
