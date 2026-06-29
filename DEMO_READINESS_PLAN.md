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

## 8. Day 161 recommendation

Convert this plan into action: run the §5 demo data checklist against a real demo
org and fix the first gap found (most likely a missing completed sparring proof
row or an empty AI-discovery candidate). Do a single live click-through of the
§2 narrative on `/coaching` and note any empty critical card or dead CTA, then
land one tiny copy/empty-state polish per gap. Keep it demo-readiness only — no
new feature lane, no migration.
