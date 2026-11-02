# Sparring Arena — audit of the existing sparring surface

Scope: staging-only prototype on branch `claude/sparring-arena` (from `claude/sprint-3-shell`).
Backend, API contracts and the live session page are **unchanged**.

## 1. Routes and entry points today

| Surface | What it is |
|---|---|
| `/sparring` | Server redirect stub → `/call-library?tab=sparring` (Day 178). **The prototype lives here.** |
| `/call-library?tab=sparring` | "Practice" tab: preset/difficulty `<select>`s, a "Start sparring" button, recent-sessions list. Left untouched. |
| `SparringStartButton` | Modal "Choose your opponent": persona cards, game mode (standard / time trial / close in 2 min), optional opponent profile, then `POST /v1/sparring/sessions`, then `router.push('/sparring/[id]')`. |
| `/sparring/[id]` | The live session (text conversation, then scoring and analytics). Reached only with a **session** id. |
| `/admin/personas` | Manager "Persona config" (persona memory, tuning) via `/v1/admin/persona-config`. This is the natural **Persona Setup** workspace. |
| `src/lib/personas.ts` | Old 3-persona MVP catalogue (price_sensitive / indecisive / silent_type). **Not** what the API serves; unused by the live flow. |
| Assignments | A `type: "sparring"` assignment carries `target_id` (persona id). It links to `/sparring/<personaId>?assignmentId=…` (a persona id in a session-id route — pre-existing oddity, not touched). |

## 2. Persona data (API: `GET /v1/sparring/personas`)

Five server-defined personas, each `{ id, label, traits[], description, difficulty_default }`:
`price_sensitive` (normal), `angry` (hard), `silent` (nightmare), `cfo` (hard), `procurement` (normal).

**Not in the contract:** role/job title, industry, behaviour/objection style as a field, estimated session length,
artwork, a "pass condition", per-persona objective.

## 3. Start flow (preserved)

`POST /v1/sparring/sessions` body: `{ personaId, difficulty, mode, targetDurationSec?, meta.opponent_profile?, assignmentId? }`.
Server resolves caller hierarchy, applies adaptive difficulty, rate-limits, returns `session.id`.
The arena sends the **same** body as `SparringStartButton` (and `assignmentId` for assigned drills, which the API already accepts).

## 4. Scoring model

- Session `total_score` is 0–100.
- The leaderboard endpoint defines a **win ("defeated") as `total_score >= 80`**; anything lower is a loss.
- `xp_awarded` on a session is only **committed XP for assignment completion** (see API comment at `sparring.ts` ~L2332).
  Free practice usually has `xp_awarded = 0`. So an "XP record" is mostly empty today; **score is the reliable record**.

## 5. Roles and visibility (important for "team" claims)

`accessibleRepIds()` returns **only the caller** for reps, and the whole tenant for manager tiers
(`Manager`, `Owner`, `PartnerAdmin`, `SuperAdmin`). `GET /v1/sparring/sessions` and
`GET /v1/sparring/leaderboard/:personaId` both use it. Therefore:

- A **manager** sees real tenant-wide aggregates.
- A **rep** sees **only their own** sessions. They cannot see a team record, team attempts or how many teammates
  defeated a persona with today's API. Showing those to a rep would be invented.

## 6. Statistics classification

| Statistic | Status | Source / rule |
|---|---|---|
| Persona name, traits, description, default difficulty | **Real** | `GET /v1/sparring/personas` |
| Your best score on a persona | **Derived (real)** | max `total` of your sessions in `GET /v1/sparring/sessions?limit=50` (last 50 only) |
| Your attempts on a persona | **Derived (real)** | count of your sessions for that persona (last 50 only) |
| Persona attempts / defeated / defeat rate | **Real** (leaderboard) | `GET /v1/sparring/leaderboard/:id`: **manager = tenant; rep = own only**. Labelled by scope. |
| Team record (best score) | **Derived (real), managers only** | max `total` over tenant sessions in the last 50; rep: **unavailable** |
| Team record in **XP** | **Unavailable** | XP is not committed for free practice; no per-persona XP record exists |
| "N reps attempted" (distinct reps) | **Unavailable** | leaderboard returns attempts, not distinct reps; a rep cannot read other reps' sessions |
| "N defeated this persona" | **Real count of defeating *sessions*** (not people) | leaderboard `wins` (score ≥ 80); manager tenant / rep own |
| Estimated session length | **Placeholder (temporary)** | presentation copy per persona id; no API field |
| Role / industry / objection style | **Placeholder (temporary)** | presentation copy per persona id; API has only traits + description |
| Pass condition | **Derived** | win = score ≥ 80, taken from the leaderboard definition |
| Microphone readiness | **Real (browser)** | Permissions API / `getUserMedia` test. **The session page does not use the microphone today**, so this is informational |
| Assigned to me | **Real** | `GET /v1/assignments`, `type = sparring`, open, `target_id` = persona |
| Recent sessions | **Real** | `GET /v1/sparring/sessions` (own for reps; tenant for managers) |
| Team Challenges | **Real persona records** (see above) | There is **no challenge model** (targets, deadlines, winners). The tab shows per-persona records only |
| Demo preview (toggle, off by default) | **Mocked, always stamped "DEMO"** | design review only; never persisted, never shown by default |

## 7. Missing data contract (proposal, not built)

To deliver the full brief without inventing data, the API would need:

1. `GET /v1/sparring/personas` to add `role`, `industry`, `objection_style`, `est_minutes`, `art_url?`, `objective`.
2. `GET /v1/sparring/personas/:id/stats` returning, **tenant-scoped and rep-safe (aggregates only)**:
   `{ attempts, distinct_reps, defeated_sessions, defeated_reps, best_score, best_xp?, record_holder_display?, your_best_score }`.
3. A decision on whether XP is committed for free practice (otherwise XP records stay empty).
4. (Optional) a challenge model for "Team Challenges": `{ persona_id, target_score, starts_at, ends_at }`.

## 8. Other findings (not changed in this prototype)

- The live session page shows XP chips ("XP 0 / Projected XP") above the conversation. The brief asks for no
  distracting live scores during the conversation; recommend hiding them in a follow-up (behaviour-neutral UI change).
- The old `src/lib/personas.ts` catalogue is dead code relative to the live API.

## 9. Prototype verification (local staging, manager role; not yet deployed)

Branch `claude/sparring-arena`. Screenshots: `docs/sparring-arena/screenshots/`.

| Check | Result |
|---|---|
| `npm run check:release` (lint 0 errors, tsc, proxy, identity, shell-nav, 35 unit tests, call-review guard, dependency guard, **production build**) | pass; `/sparring` route is 11 kB (172 kB first load) |
| Day 178 / 192 / 290 validators | pass |
| axe-core (WCAG 2 A/AA + best-practice) on `/sparring`: demo on, demo off, briefing open | 0 violations in all three |
| Keyboard: arrows, Home/End, wrap both ways, Enter opens briefing, Escape closes, focus returns, tab arrows | pass |
| Pointer: drag (≈1 card per 110 px), wheel, prev/next buttons, side-card click | pass |
| No auto-rotation: no timers advance the carousel; selection unchanged after 7 s idle; static test forbids `setInterval`/autoplay/rAF | pass |
| Reduced motion: compiled CSS contains the `prefers-reduced-motion` rules; normal mode shows the transitions/float. (OS setting could not be toggled in this browser, so this is a CSS verification, not a behaviour test) | pass |
| Mobile (375): strip layout, scroll-snap, no 3D, no page overflow | pass |
| Start flow: Challenge → briefing → Begin created a session with `persona_id: silent`, `difficulty: nightmare`, `mode: standard`, then opened the unchanged `/sparring/[id]` | pass |
| Real data shown only from existing endpoints; empty staging results render as 0 / "—" / "no scored sessions yet" | pass |

### Fixes found during verification
- Filled difficulty pips were transparent inside the briefing (colour came from a variable defined only on `.arena`). Now literal.
- "no attempts yet (1 attempt)" contradicted itself for an unscored attempt. Now "no scored attempts yet".
- Rapid prev/next steps computed from a stale index; stepping now reads a synchronously updated ref.

### Known caveats
- The ±2 "ghost" cards are intentionally faint (opacity ≈ 0.2); text there is below AA. They are decorative previews; the selected card and ±1 neighbours (opacity ≈ 0.6) meet AA.
- Verified as **manager** only. A rep sees personal stats only (team record shows "Not available", by design). Rep pass still to do.
- Mic readiness reflects the browser state; today's session is text-only, so the check is informational.
- The live session page still shows XP chips above the conversation (follow-up: hide).
- A first hard navigation after switching viewport emulation sent the dev server to `/login` once; a reload worked (same dev-server artefact seen earlier; not reproduced on hosted staging).
- Mocked data exists only behind the "Preview with demo data" toggle (off by default, every value stamped DEMO).
