# Pre-Demo Runbook — Lighthouse Client Demo

Day 173. Pairs with `LIGHTHOUSE_DEMO_SCRIPT.md` (talk track + click path)
and `DEMO_READINESS_CLOSEOUT.md` (lane status).

## 1. Before every demo

1. Pull latest on both repos (`claude/sprint-3-api`, `claude/sprint-3-shell`).
2. Restart both servers:
   - API: `cd ~/Dev/gravix-sales-trainer-api && npm run dev` (port 4000)
   - WEB: `cd ~/Dev/gravix-sales-trainer-web && npm run dev` (port 3000)
3. Re-seed if needed (see §2–3 — order matters).
4. Log in as Dana (see §5).
5. Open `/coaching` and run the visual checklist (§6).

## 2. Re-seed commands (order matters)

```bash
cd ~/Dev/gravix-sales-trainer-api
npm run seed:demo
npm run seed:ufc-story
```

`seed:demo` refreshes the whole UFC org (users, calls, filenames, dates).
`seed:ufc-story` must run **after** it — it re-stamps the hero call title
("Nate Diaz — Price Objection Call") and the Whisperer/Discovery/sparring
story. Both are idempotent.

## 3. When to re-seed

- Before any external demo.
- After ~7 July 2026 (30-day window ageing — Review Queue and Whisperer
  panels only look back 30 days).
- After changing seed scripts.
- If the Review Queue looks empty or thin.

## 4. Validation commands

API (`~/Dev/gravix-sales-trainer-api`):

```bash
npx tsx scripts/validate-ufc-demo-seed.ts
npx tsx scripts/validate-demo-data-visibility.ts
npx tsx scripts/validate-manager-pins-access.ts
```

WEB (`~/Dev/gravix-sales-trainer-web`):

```bash
npm run validate-demo-readiness-day-172
npm run validate-tier-2b-smoke
npm run build
```

## 5. Demo login

- Org: **UFC Elite** (single-org demo — the whole story from one login)
- User: `dana.white@ufcelite.demo` (manager)
- Password: the shared demo password printed by `npm run seed:demo`
  (do not write secrets in docs).

## 6. Quick visual checklist (2 minutes, as Dana)

- [ ] `/coaching` loads; Review Queue count > 0.
- [ ] Hero call **"Nate Diaz — Price Objection Call"** visible (top of
      Review Queue, score 45).
- [ ] Call detail opens; human header, no "forbidden", pins card calm.
- [ ] Whisperer Insights panel populated (sessions/triggers/latency).
- [ ] AI Discovery candidate visible (approval-gated).
- [ ] "Partner approval" custom trigger visible.
- [ ] Queue-assigned sparring panel visible.
- [ ] Sparring proof scores visible (62 → 78 improving trend).

## 7. Fallback plan (if a section fails mid-prep or mid-demo)

- **Review Queue empty:** re-run `npm run seed:demo` then
  `npm run seed:ufc-story` (that order), refresh.
- **Whisperer/Discovery/sparring story missing:** run
  `npm run seed:ufc-story`, refresh.
- **Dana login fails:** use a dev account only as a fallback; do not
  switch accounts mid-demo unless necessary — the story is built for
  Dana's single login.
- **Upload Call fails:** skip the live upload; explain that uploaded
  recordings enter the same review queue.
- **Audio/signed URL fails:** continue with score, summary and Whisperer
  moments — audio playback is not central to the demo. Gravix does not
  own the call; it coaches from the recording.
