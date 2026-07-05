# Coaching Overview Simplification — Day 180

Companion to `PREMIUM_UX_AUDIT.md` §12. WEB-only, patch mode, Overview tab of
`/coaching` only. No features deleted, no API changes, no data-loading changes,
all tabs and anchors preserved.

## Why

Day 177 identified `/coaching` as the most overwhelming page in the product:
three competing "what do I do" areas above the fold, three overlapping stat
grids, and four different per-rep views stacked on one tab.

## Before (Overview render order)

1. Header: eyebrow + "Command Centre" + subtitle + **Upload Call** + **Review Calls** CTAs
2. Tabs
3. "Manager workflow" strip — "Start here" badge, two explanatory paragraphs, five buttons
4. Command Centre panel — its own duplicate heading, four large priority cards,
   four-box "Team coaching snapshot", sparring progress row
5. Coaching Queue
6. Queue-assigned sparring (five stat boxes + three rows)
7. Sparring score trend (four stat boxes + highlights + rows + by-rep/by-drill grids)
8. Team Health (6 StatCards)
9. Reps Needing Attention / Calls Needing Review / Open Coaching (3-col grid)
10. Weakest Skills + right column (Time Saved, Coaching Impact, Recent Sparring,
    Whisperer Insights, Suggested Trigger Candidates, Custom Triggers)
11. Fuchsia "AI Manager Briefing"
12. 8 KPI cards (4 duplicated Team Health)
13. Intelligence grid — "1. Who needs help?" / "2. What are they bad at?" /
    "3. Coaching Plans" (with fake `mockTrend` arrows)
14. Coaching Health timeline (per-rep momentum)
15. Full rep table

## After (Overview render order)

1. Header: eyebrow + "Manager Command Centre" + one calm subtitle (no CTAs)
2. Tabs
3. **Primary actions row** — Upload Call (indigo), Review Queue, Coaching Queue,
   Assign Sparring, AI Discovery
4. **Today's priorities** — compact list; only rows that need attention render
   (review count, reps at risk, overdue assignments *or* suggested next drill,
   AI Discovery suggestions); "All clear" when nothing is urgent
5. Coaching Queue (unchanged)
6. "More insights below" divider
7. Team Health (6 StatCards, unchanged)
8. Reps / Calls / Open Coaching 3-col grid (unchanged)
9. Weakest Skills + right column (Whisperer Insights, **AI Discovery** — retitled,
   Custom Triggers; copy diet only)
10. **Sparring follow-through** (collapsed `<details>`): sparring progress line +
    Queue-assigned sparring + Sparring score trend — content unchanged, moved down
11. Manager briefing (neutral styling, was fuchsia "AI Manager Briefing")
12. 4 KPI cards (duplicates removed)
13. **Rep coaching breakdown** (collapsed `<details>`): intelligence grid with
    calm headings + Coaching Health timeline — content unchanged
14. Full rep table (unchanged, still visible)

## Principles applied

- One primary action area, one priorities block; everything else is evidence.
- Collapse and move, don't delete: both `<details>` groups keep full content one
  click away; `#queue-sparring` / `#ai-discovery` / `#custom-triggers` /
  `#coaching-queue` anchors preserved.
- Honest data only: `mockTrend` arrows removed; share bars now show real
  percentages.
- Calm colour: indigo for CTAs; red/amber reserved for overdue/risk counts;
  fuchsia removed.
- Copy diet: internal/demo-sounding lines removed ("Start here", "nothing is
  auto-created, auto-activated, or auto-completed", raw candidate ids), repeated
  approval disclaimers reduced to one per surface.
