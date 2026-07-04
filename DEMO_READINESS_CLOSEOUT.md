# Demo Readiness / Lighthouse Client Prep — Lane Closeout

Day 173 (2026-07-04). Lane opened Day 160, closed Day 173.

## Status

**Ready for controlled lighthouse demo.**

## What is ready

- Single-login demo story as `dana.white@ufcelite.demo` (UFC Elite):
  Command Centre → Review Queue → hero call review → coaching action →
  queue-assigned sparring → proof/score trend (62 → 78) → Whisperer
  Insights → AI Discovery candidate (approval-gated) → Upload Call.
- Hero call reads **"Nate Diaz — Price Objection Call · 45/100"**; all
  demo-path call labels are human (no raw filenames, UUID headers or
  "Weakest: Unknown").
- Manager scope fixes proven live: review-queue hierarchy scoping,
  null-office manager 403s, manager pin reads, tenant-scoped team users.
- Idempotent seeds (`seed:demo` → `seed:ufc-story`) with validators.
- Founder talk track (`LIGHTHOUSE_DEMO_SCRIPT.md`) and pre-demo runbook
  (`PRE_DEMO_RUNBOOK.md`).
- Timed rehearsals Days 170 and 172 (~6 minutes, inside the 5–7 window).

## What is not ready (deliberately)

- Tier 2C voice output and Tier 2D audio scoring — paused until demo
  value is proven.
- Browser extension / dialler / native call system — not in scope.
- Rep-first workspace — manager workflow shipped first.
- Live upload during the demo — supported, but the script treats it as
  show-don't-run.

## Known caveats

- Seeded calls lack real transcript/audio depth in places; duration can
  show "—" (no audio artefact) — the script avoids those tabs.
- Seeded data ages out of 30-day windows — re-seed before demos after
  ~7 July 2026 (runbook §3).
- Legacy dev data exists (repless test uploads show the calm
  "Sales call review" fallback; `gravix.com` dev users appear in UFC
  dropdowns) — data noise, not a scoping leak.
- Typecheck baselines are still noisy (API ~60, WEB ~186 pre-existing
  errors); day-scripts check against these baselines.
- Voice/audio lanes paused; no LLM on the live hot path; all trigger and
  assignment changes remain manager-approval gated.

## Final commands

```bash
# Re-seed (order matters)
cd ~/Dev/gravix-sales-trainer-api && npm run seed:demo && npm run seed:ufc-story

# Validate
npx tsx scripts/validate-ufc-demo-seed.ts
npx tsx scripts/validate-demo-data-visibility.ts
cd ~/Dev/gravix-sales-trainer-web && npm run validate-demo-readiness-day-173 && npm run validate-tier-2b-smoke
```

## Final SHAs (lane close)

- API `claude/sprint-3-api`: `d0de9fa` — fix: seed friendly demo call titles
- WEB `claude/sprint-3-shell`: `7c0f851` + Day 173 docs commit — see git log

## Next lane recommendation

Move off demo work. Recommended next sprint lane: **rep workspace /
rep-facing coaching loop** (the demo's most-asked follow-up: "can reps use
it themselves?") — rep home surfacing assigned drills, sparring history,
score trend and next-best practice, reusing the existing assignments/proof
data with no new migrations. Alternative if commercial pressure demands:
CRM workspace polish. Return to Tier 2C/2D voice/audio only after
lighthouse feedback proves the demo value.
