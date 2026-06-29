# Demo Readiness Plan — Lighthouse Client Prep (Day 160)

First Demo Readiness / Lighthouse Client Prep layer for Gravix AI Sales Trainer.
This is a readiness audit and runbook — not a new feature lane. It maps a clean
manager demo path, audits demo-facing routes, and lists what must be polished or
avoided before showing Gravix to real lighthouse clients.

**Product rule (always true):** Gravix does not own the call. Gravix listens to
the call, coaches the rep, scores the session, and trains the team. The manager
stays in control — nothing is auto-created, auto-activated, or auto-completed.

---

## 1. Demo positioning

> **Gravix helps sales managers review calls, assign targeted practice, and
> track coaching follow-through from one command centre.**

One manager surface. Real calls in, weak skills surfaced, targeted sparring
assigned, follow-through tracked, and AI-discovered coaching moments reviewed —
all without Gravix touching the dialler or the phone system.

---

## 2. Demo narrative (7-step walkthrough)

The whole story runs from **/coaching** (the Manager Command Centre). Steps 1–7
are a single linear path a manager can click through live.

1. **Open Manager Command Centre** — land on `/coaching`. The Demo flow strip at
   the top of the Overview tab is the spine of the demo.
2. **Show the team coaching snapshot** — priority actions, reps at risk, team
   health headline. Manager sees where to spend attention first.
3. **Open the Coaching Queue** — the prioritised list of reps/calls that need a
   manager decision (the "Assign sparring" step jumps here).
4. **Review a weak skill / call needing review** — open the Review Queue tab or a
   reviewed call at `/calls/[id]`; the weak skill and recommended drill are shown.
5. **Assign the recommended sparring** — manager clicks to assign the targeted
   drill to the rep. Manager-initiated only; nothing auto-assigns.
6. **Show queue-assigned sparring follow-through** — the queue-assigned sparring
   block shows the drill was assigned, then its completion proof and score trend.
7. **Show AI Discovery / Whisperer Insights** — review AI-discovered trigger
   candidates and Whisperer session moments; manager approves or defers. AI
   discovers, managers approve — no auto-create, no auto-activate.

---

## 3. Safe routes to show

| Route | Status | Notes |
|-------|--------|-------|
| `/coaching` | **Primary demo route** | Manager Command Centre. Start here. Demo flow strip drives the whole story. |
| `/calls/[id]` | Show if demo call exists | Call review: weak skill, recommended drill, replay/trigger moments. Only open a reviewed call. |
| `/call-library` | Show only if populated | Real list of past calls/sessions; depends on seeded demo data. `/recent-calls` redirects here. |
| `/dashboard` | Optional (rep view) | Rep-side dashboard. Optional to show the rep perspective; not central to the manager story. |
| `/sparring/[id]` | Show if a seeded drill exists | The sparring drill runner. Use a known-good drill only. |
| `/whisperer` | Show with care | Live Whisperer session with moments. Avoid the local simulator flake; show a seeded session, not a cold start. |

---

## 4. Avoid / risky routes

- `/crm/manager/control-centre` — **redirects to `/coaching`**. Not a demo route;
  don't navigate here on stage (it just bounces).
- `/recent-calls` — redirects to `/call-library`. Link to `/call-library` directly.
- `/dev/audio-test`, `/health`, `/admin/status` — internal/diagnostic. Never demo.
- Deep `/admin/*` and `/crm/*` sub-pages (auto-assign runs, partners, nudges,
  imports) — out of the manager coaching story; skip unless asked.
- Any route that depends on unseeded data — an empty critical card reads as broken.
  Verify data is loaded before navigating (see §5).

---

## 5. Demo data checklist

Minimum seeded data for a clean run:

- [ ] 2–3 reps in the org
- [ ] 3–5 reviewed calls
- [ ] 1 low-score call (drives the "weak skill" moment)
- [ ] 1 rep needing attention (shows in Coaching Queue / at-risk)
- [ ] 2 open assignments
- [ ] 1 queue-assigned sparring drill
- [ ] 1 completed sparring proof row (completion proof + score trend)
- [ ] 1 AI trigger candidate (for the AI Discovery approve step)
- [ ] 1 custom trigger
- [ ] 1 Whisperer session with moments
- [ ] 1 call replay with trigger moments

---

## 6. Lighthouse client readiness checklist

- [ ] Login works (manager account)
- [ ] Manager demo route (`/coaching`) stable and fast
- [ ] Sample data loaded (all of §5)
- [ ] No broken CTAs anywhere in the demo path
- [ ] No obvious empty critical cards on the demo path
- [ ] Pricing / value story ready
- [ ] Data privacy explanation ready (Gravix listens, does not own the call)
- [ ] Onboarding runbook drafted

---

## 7. What not to demo yet

- Tier 2C voice sparring (paused)
- Tier 2D audio scoring (paused)
- Native call system / dialler / phone system / CRM calling (paused)
- Browser extension (paused)
- Advanced AI auto-actions
- **auto-create** triggers — never; managers approve
- **auto-activate** triggers — never; managers activate
- Auto-completing assignments without a manager click

---

## 8. Day 161 — UX simplification (done)

UX simplification started ahead of demo data work. On `/coaching`:

- **Upload Call is now visible from `/coaching`** — a primary CTA in the Command
  Centre header (and the first step of the workflow strip).
- The "Demo flow" strip was refined into a calmer **Manager workflow** navigation
  strip: Upload Call → Review Calls → Coaching Queue → Sparring → AI Discovery.
- Upload Call was also promoted into the sidebar so managers never hunt for it.
- Shouty "Start demo here" badge softened to a calm "Start here"; header copy now
  leads with "Start by uploading a recorded sales call."

See [UX_SIMPLIFICATION_PRINCIPLES.md](UX_SIMPLIFICATION_PRINCIPLES.md) for the
principles future days must follow.

**Next step:** demo data readiness check — run the §5 checklist against a real
demo org and fix the first gap found.

---

## 9. Day 162 — Upload flow structured linking (done)

The Upload Call page was restructured for cleaner demo data and a calmer flow.

- **Structured linking started.** `/upload` now asks "Who is this call for?" first,
  with an **Account / Company** picker (CRM accounts via `GET /v1/accounts`) and a
  **Rep** picker (team members via `GET /v1/team/users`).
- **Account linking persists.** A small fail-soft API patch makes
  `POST /v1/upload/finalize` accept an optional `accountId` and write it to the
  existing `calls.account_id` column (no migration). If linking is rejected the
  upload still succeeds without the link.
- **Free-text fallback preserved.** When no CRM accounts/reps are available the
  page falls back to free-text fields, and the rep name remains the required
  field — quick demos still work.
- **Calmer layout + copy:** three numbered steps (who → context → recording), a
  primary "Upload and send to review queue" CTA, a "Back to Manager Command Centre"
  secondary, and clearer post-upload success with Command Centre / View call /
  Upload another call actions.

**Remaining demo-data gap:** the `calls` table has no column for rep linkage
(rep = uploader `user_id`), call type, or a free-text tag/label, so rep / call
type / tag are UI-organisational only and do not yet persist server-side.

**Day 163 recommendation:** add the small backend data model for upload metadata
— an optional `rep_id` (or persist the chosen rep), plus a `call_type` / `label`
column — behind a single small migration, then persist those fields from
`/upload`. Pair with the §5 demo-data checklist run against a real demo org.
