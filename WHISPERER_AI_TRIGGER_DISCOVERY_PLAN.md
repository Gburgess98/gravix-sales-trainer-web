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
