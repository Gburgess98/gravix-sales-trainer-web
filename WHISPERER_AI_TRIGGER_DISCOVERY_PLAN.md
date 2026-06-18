# Whisperer AI Trigger Discovery — Architecture Note

Status: **Architecture planned** (not implemented). Day 125.

This documents a future layer where AI *suggests* new Whisperer trigger
candidates from call history, but a **manager approves them before they go
live**. It is a plan only — no endpoint or model is shipped today.

## Why AI does not blindly control live triggers

Gravix does not own the call. We listen, coach, score and train — we do not
put unreviewed automation in front of a rep mid-call. Live triggers are the
sharpest surface we have, so:

- A bad auto-generated trigger would fire noisy/incorrect coaching in real time.
- Managers own their team's objection playbook; AI assists, it does not decide.
- We already measure suggestion usefulness (used/ignored/not relevant) and flag
  noisy custom triggers — discovery should feed that same human-in-the-loop loop,
  not bypass it.

So AI proposes; the manager disposes.

## Proposed flow

```
call history / Whisperer moments
   → AI spots repeated objection patterns (offline / batch, not hot path)
   → suggested trigger candidate
   → manager approves / edits / rejects
   → saved into the Custom Trigger Library (existing whisperer_trigger_library)
```

The candidate never activates on its own. Approval is the only path from
"candidate" to a live custom trigger.

## Candidate shape

```jsonc
{
  "phrasePattern": "you're more expensive than <competitor>",
  "triggerType": "price",          // existing trigger taxonomy
  "confidence": 0.78,              // model's confidence, advisory only
  "examples": [                    // real (redacted) segments that matched
    "honestly you're pricier than Acme",
    "their quote came in well under yours"
  ],
  "suggestedResponse": "Acknowledge, then reframe on value vs the cheaper quote.",
  "suggestedUrgency": "high",      // low | medium | high
  "reason": "Seen 7× across 4 reps in the last 30 days, mostly unhandled"
}
```

This maps cleanly onto the existing Custom Trigger Library fields
(match_phrases/keywords, type, suggestion_title/response, urgency), so an
approved candidate is a straightforward insert — no schema churn expected.

## Guardrails

- **Manager approval required** — no candidate goes live without it.
- **No LLM on the live hot path** — discovery runs offline/batch over stored
  moments, never inside `/segments`.
- **No automatic activation** — approval is an explicit manager action.
- **Tenant-scoped** — candidates are derived from and visible to a single
  org/company/office only.
- **Audit later** — approve/edit/reject actions should be audit-logged when built
  (reuse the existing audit pipeline).

## Future endpoint idea (not built today)

```
GET /v1/manager/whisperer-trigger-candidates?days=30
→ { ok, persistence, items: Candidate[], count }
```

Read-only, manager-gated, tenant-scoped — surfaces candidates for review. A
companion approve action would insert into the Custom Trigger Library. Both are
deferred; this note exists so the data and UX are designed for human approval
from day one.

## Status (Days 130–132)

- **Day 130** — read-only `GET /v1/manager/whisperer-trigger-candidates` shipped,
  mining `whisperer_triggers.segment_text`. No DB writes, no activation.
- **Day 131** — "Use this candidate" pre-fills the existing Custom Trigger form;
  the manager edits and saves manually. No auto-submit, no API change.
- **Day 132** — the endpoint now **dedupes**: candidates overlapping an enabled
  in-scope custom trigger (phrase or keyword) are suppressed, with
  `summary.suppressedExistingCount` reported. Web adds a local **hide/dismiss**
  ("Hide for now") and hides a candidate once it has been loaded into the form.

- **Day 133** — **persistent candidate decisions** shipped. Migration
  `sql/20260617_whisperer_trigger_candidate_decisions.sql` adds the decisions
  table; `POST /v1/manager/whisperer-trigger-candidates/:id/decision` records
  `approved` / `dismissed` / `rejected` (tenant-stamped, manager-gated). The
  candidate GET now suppresses any candidate with a persisted decision in scope
  and reports `summary.suppressedDecisionCount`. Candidate ids are stable
  (`candidate-<type>-<token>`) so decisions match across runs.

### Decision lifecycle (Day 133)

- A decision **never** creates or enables a trigger — activation still requires
  a Custom Trigger Library save. "Use this candidate" pre-fills the form and the
  candidate is marked `approved` only **after** a successful save.
- Dismiss → `dismissed`; Reject → `rejected`. Both persist per manager scope and
  survive refresh (closing the Day 132 caveat). Fail-soft: if the migration is
  not applied, the decision POST returns `503 migration_required` and the UI
  falls back to hiding for the session; the candidate GET still works with
  `suppressedDecisionCount: 0`.

- **Day 136** — **reviewed candidate history + un-dismiss** shipped.
  `GET /v1/manager/whisperer-trigger-candidate-decisions?days=30&limit=20` lists
  the manager's persisted decisions in scope (fail-soft `persistence:false` when
  the table is missing). `DELETE /v1/manager/whisperer-trigger-candidates/:id/decision`
  removes the decision row in scope ("un-dismiss / reopen") so the candidate is
  eligible to surface again — it never deletes a custom trigger or activates
  anything (`503 migration_required` if the table is missing; `restored:false`
  if no row). The `/coaching` Suggested Trigger Candidates card now shows a
  **Reviewed candidates** section with decision badges and a **Restore** action
  for dismissed/rejected items. Approved candidates are shown but **not**
  restorable in this MVP (`Already approved`). Restore is audit-logged
  (`whisperer.candidate_decision_restore`).

- **Day 137** — Day 136 history + restore **live-proofed** against the API and
  live tenant DB (dismiss → history → suppressed → restore → eligible again;
  non-manager `403`; restore touches no custom trigger). Tagged
  `sprint-day-137-complete` (API `346b9cd`, WEB `9820503`).

- **Day 138** — **candidate detail / review view** shipped (WEB-only, no
  migration, no new backend write). The `/coaching` Suggested Trigger Candidates
  **Review** expander now renders a structured detail panel: header (title /
  type / confidence / seen count / Candidate badge), **Why Gravix suggested
  this** (reason + description), **Suggested trigger setup** (name, phrases,
  keywords, urgency), **Suggested response**, and **Examples** (up to 3 with
  detected date + shortened session id). Manager controls (Use this candidate /
  Dismiss / Reject) sit inside the panel; nothing activates until a manager
  saves a custom trigger. The Reviewed candidates rows also surface the stored
  source snapshot (seen count / confidence / examples count) when present.

### Future

- **Approved candidate → source custom trigger link** once the library carries
  candidate meta/source, so an approved candidate links to the trigger it
  created.
- **Raw transcript blind-spot discovery** once raw segments are stored (today
  discovery only mines stored trigger segment text).
- A fuller **audit history** view (who actioned what, when) beyond the
  lightweight reviewed-candidates list.
