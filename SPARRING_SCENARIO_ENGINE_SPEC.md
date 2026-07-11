# Sparring Scenario Engine — Spec (Day 210)

Status: **Design documentation only.** No sparring runtime changes, no
backend, no routes. Companion to `OBJECTION_LIBRARY_BLUEPRINT.md`
(scenarios belong to objection items) and
`OBJECTION_TO_ASSIGNMENT_FLOW.md` (assignment + proof loop).

## 1. Product intent

Sparring today runs generic persona sessions. The Scenario Engine makes
practice **specific**: a scenario is a manager-authored drill for one
objection — which persona raises it, how hard they push, what a good
response must contain, and what counts as failing. The rep practises the
exact moment their calls show they lose.

**A scenario parameterises the existing sparring engine; it does not
replace it.** The five personas (`price_sensitive, angry, silent, cfo,
procurement` in `api/src/personas.ts`), their emotional-state machinery,
difficulty levels, session/turn storage and scoring all stay as they are.
The scenario supplies the objection script and the judging guidance.

## 2. Scenario Builder UX

Entry: **Create scenario** on an objection detail page (pre-filled from the
item) — scenarios are always children of a library item in MVP; there is no
free-floating scenario builder. Editor is a takeover at
`…&objection=<id>&scenario=<sid>`, same grammar as the Scorecard editor.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ← "It's too expensive"                                                   │
│ Price pushback — tour close        ● Draft v2       [Preview brief ▸]    │
├──────────────────────────────────────────────────────────────────────────┤
│ SETUP                                                                    │
│  Persona      [ Price-sensitive ▾ ]     Difficulty  [ Normal ▾ ]         │
│  Buyer pressure                                                          │
│  [ The buyer liked the tour but flinched at £49.99. They have a         ]│
│  [ PureGym quote open on their phone and will push the comparison       ]│
│  [ twice before considering value.                                      ]│
│                                                                          │
│ WHAT GOOD SOUNDS LIKE (response signals)                                 │
│  ✓ Anchors the member's stated goal before defending price               │
│  ✓ Prices against value ("under £3 a visit"), not against PureGym        │
│  [+ Add signal]                                                          │
│                                                                          │
│ WHAT FAILS (fail signals)                                                │
│  ✗ Offers a discount or the cheaper tier unprompted                      │
│  ✗ Agrees the price is high                                              │
│  [+ Add signal]                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│ ● Draft v2 — not available to assign · Active v1 in use                  │
│                                      [Archive]   [Activate v2]           │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Preview brief** drawer: the transparency pattern (Days 208–209) — the
  exact brief the rep will see and the exact guidance the judging step
  receives, rendered deterministically from the draft. Judging guidance is
  visibly separated from the rep brief (reps don't see fail signals in
  advance; managers see both and the drawer says who sees what).
- Guidance panel content (static): what makes a good signal — observable
  in a reply, one behaviour per signal, phrased as the manager would say
  it. Suggested 2–5 signals per list; soft cap 8.

## 3. Scenario fields

| Field | Key | Type | Required | Notes / Effect |
|---|---|---|---|---|
| Name | `name` | text | **Yes** | e.g. "Price pushback — tour close". Shown on assignments, sessions, proof surfaces. |
| Objection item | `objection_item_id` | reference | **Yes** (fixed at creation) | Parent; brief inherits the item's approved response + coaching note. |
| Persona | `persona_id` | select (existing five) | Yes | Which buyer raises it. MVP uses the fixed persona set — no custom personas. |
| Difficulty | `difficulty` | select (existing levels) | Yes (default Normal) | Reuses the engine's difficulty behaviour and XP mapping untouched. |
| Buyer pressure | `buyer_pressure` | longtext | **Yes** | The situation + how persistently the persona pushes; becomes scenario grounding in the persona prompt. |
| Response signals | `response_signals` | list of text | **≥1 to activate** | What a passing response must contain; drives judging guidance and post-session feedback ("you anchored the goal ✓"). |
| Fail signals | `fail_signals` | list of text | No | Instant-coaching moments; seeded from the item's weak responses + no-go language (editable copies, not live links). |
| Rep brief | `rep_brief` | longtext | No | What the rep reads before starting; auto-drafted from item fields, manager-editable. Never includes fail signals. |

System/version fields: `scenario.status` (`draft · active · archived`),
`version`, `version.status` (`draft · active · superseded`), `origin`
(`manual` only in MVP), `created_by`, `activated_by/at`.

## 4. Data entities

```
sparring_scenarios                (table)
  id, company_id, objection_item_id, name, status,
  active_version_id, created_by, created_at

sparring_scenario_versions       (table — immutable once activated)
  id, scenario_id, version, status,
  persona_id, difficulty, buyer_pressure,
  response_signals jsonb, fail_signals jsonb, rep_brief,
  origin, created_by, activated_by, activated_at, created_at
```

Version lifecycle mirrors the Scorecard Studio exactly: edits to an active
scenario fork a draft; activation supersedes; versions are immutable;
archive is read-only with restore-as-draft. One lifecycle grammar across
the whole Intelligence Layer.

## 5. Runtime integration (contract — built in the OL-5 lane, not now)

- **Session creation:** sparring session started from an assignment (or
  the scenario page) carries `scenario_version_id`; the engine composes
  the persona exactly as today **plus** the version's buyer pressure and
  objection phrases as scenario grounding.
- **Judging:** response/fail signals join the existing turn-analysis
  guidance; post-session feedback names signals hit and missed, and quotes
  the item's approved response on misses.
- **Stamping:** `scenario_version_id` stored on the session
  (`sparring_sessions.meta` in MVP — same precedent as Day 155 proof
  meta). Sessions permanently reference the version that briefed them;
  activating v3 never changes what a v2 session meant.
- **Fallback:** a session with a missing/archived scenario version still
  replays fine — the brief is read from the immutable version row.
- **No engine changes in this design** — grounding and judging guidance
  are additive inputs the engine already accepts conceptually (persona +
  difficulty + prompt guidance); the integration lane proves it live
  before merging, per house rules.

## 6. Guardrails

1. Activation is a manager action with the standard confirmation
   ("Reps can be assigned this scenario. Sessions already run are
   unchanged."). Drafts cannot be assigned.
2. Fixed persona set and difficulty levels in MVP — no custom personas,
   no new difficulty tiers, no engine forks.
3. Signals are plain manager language; the UI never shows or asks for
   prompt-engineering.
4. Company-scoped end to end; scenarios never visible cross-org.
5. Archived scenarios stay readable from historical sessions and
   assignments.
6. No AI-generated scenarios in v1 (a draft-only generator following
   `AI_SCORECARD_BUILDER_SPEC.md` patterns is a natural later addition).

## 7. Deferred

- AI-drafted scenarios from evidence calls (draft-only, later).
- Custom personas; per-scenario voice settings.
- Multi-objection scenarios (chained pressure) — one objection per
  scenario keeps judging honest in MVP.
- Scenario difficulty auto-progression (rep passes → harder variant).
- Team scenario leaderboards (arcade risk; needs the trust language pass
  the platform already went through).
