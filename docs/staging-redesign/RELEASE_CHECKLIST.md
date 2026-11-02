# Staging UI redesign — staging → production release checklist

Status: DRAFT for approval. Nothing here has been run against production. Nothing is pushed.
Owner of every production step: the operator (George). Claude does not deploy production.

## 0. Read this first — what "promote" really means

1. **The redesign is WEB-only.** No API code, schema, migration or env change comes from it.
2. **But the branch is not a small diff against production.** `claude/sprint-3-shell` is **233 commits ahead
   of `main`**, which is the branch the production Vercel project tracks. Promoting this branch promotes
   *all* of the release candidate (proxy hardening, identity boundary, typecheck/lint/build fixes, …), not
   just the UI. The identity-boundary work needs **matching `PROXY_SHARED_SECRET` on WEB and API**
   (see `SECURITY_ROLLOUT_CHECKLIST.md` §1, §3, §6). Treat this as a full WEB release candidate promotion.
3. **The redesign commits are local only** (12 at the time of writing, plus this one; see `git log origin/claude/sprint-3-shell..HEAD`). They must be pushed
   (needs your explicit go) before any hosted staging deploy can contain them. A branch push does not
   auto-deploy the Vercel staging project; that is a separate operator step.

## 1. Go / no-go gates

| Gate | Status |
|---|---|
| Typecheck, lint (0 errors), proxy-boundary check, identity guard, shell-nav validator, call-review guard, dependency guard, **production build** — `npm run check:release` | ✅ passing locally |
| Unit tests (`npm test`): nav model + role filtering, active state, progress model, contrast tokens, skip link | ✅ 22 passing |
| Automated WCAG 2 A/AA + best-practice scan (axe-core), manager (15 screens) and rep (9 screens), desktop | ✅ 0 violations after fixes (see §5) |
| Tablet (768) and mobile (375) layout: no horizontal overflow on checked screens | ✅ manager role |
| Keyboard: skip link, sidebar order and focus rings, drawer Escape | ✅ |
| **Rep-role verification** on local staging (Home, Calls, Practice, Coaching, Progress, Upload, Profile, call review): five-item nav exact, no manager items leak, axe 0 violations (WCAG 2 A/AA + best-practice), mobile drawer + no overflow | ✅ local staging, rep `SalesRep`. ✅ **hosted staging** (deploy of `78e05b1`, 2026-11-02): direct `/dashboard` load, greeting + SalesRep chip, six-item nav, skip link, Progress, Calls, Practice, call review (single main, glass header, no blur in transcript), sidebar back/forward, mobile drawer + Escape, upload form fits 375px. ⬜ hosted **manager** pass |
| **Usability test** with the people who found the current system confusing (brief §Phase 5) | ⬜ not done |
| Screen-reader pass (VoiceOver/NVDA) and manual contrast review of the Call Review transcript with real data | ⬜ not done |
| Rep and manager data-rich walkthrough (staging seed has almost no calls/scores) | ⬜ not done |
| Product approval of navigation and hierarchy | ⬜ |
| Rollback owner and window agreed (§4) | ⬜ |

Do not promote until every ⬜ is closed or explicitly waived.

## 2. What users will notice (changes to communicate)

Routes are unchanged; labels and placement moved.

| Before | After |
|---|---|
| Dashboard | **Home** (rep) / manager's own copy is **My Dashboard** under More |
| — | **Overview** (manager) → the Command Centre Overview tab (`/coaching`) |
| Sparring | **Practice** (nav, page title, tab) |
| Assignments (all roles → `/assignments`) | Rep: **Coaching** (`/assignments`). Manager: **Assignments** = team view (`/coaching?tab=assignments`); own queue = **My Assignments** under More |
| Analytics | **Insights** |
| Command Centre (all) | Hidden **for managers only** (same page as Overview); reps still see it |
| — | **Reviews** (manager) → `/coaching?tab=review` |
| — | **Progress** (new `/progress`, rep; managers: My Progress under More) |
| Chart, skill board, development level on Home | Moved to `/progress`; Home links to it once |
| Admin Settings | **Settings** (restyled for the dark theme) |
| `/sparring/[id]` | conversation first, analytics after; raw rep UUID no longer shown |

Nothing was deleted. Upload Call stays one click from every screen.

## 3. Pre-deploy (local, no side effects)

```bash
npm run check:release        # includes npm test and the production build
npm run validate-security-day-175
```

Known baseline failures that pre-date this phase (not in `check:release`): Day 183/184/185/187/191/225/226 legacy
validators, and Day 201 ("Progress Today" label, removed in the pilot). Days 200/201 pins were re-pointed at the moved content.

## 4. Staging deploy and rollback

Staging project: `gravix-sales-trainer-web-staging` (Vercel). API: `gravix-sales-trainer-api-staging` (Railway).

1. Push the branch (**needs your go**), then deploy the staging WEB project (operator; a push alone does not deploy).
2. Verify on the hosted staging URL with a staging **rep** and **manager**: sign in, then run the §6 smoke list.
3. Run the usability tasks (§7) on staging.

**Rollback (WEB-only redesign):** redeploy the previous Vercel production deployment (Vercel → Deployments →
promote previous). Because the redesign is additive on routes, no data or API rollback is involved.
Record the previous production deployment id **before** promoting. If the promotion also carried the RC
security changes, follow `SECURITY_ROLLOUT_CHECKLIST.md` §6 (API first, then WEB; never unset
`NODE_ENV=production` on the API).

## 5. Accessibility changes already made (verify, don't re-do)

- `neutral-500`/`neutral-600` overridden in `globals.css` (were 4.17:1 and 2.53:1 on #0a0a0a; now ≥ 4.67:1 on
  the app surfaces). Guarded by `tests/unit/contrast-tokens.test.mts`. Design rule: no text darker than neutral-600.
- Accessible names added to 13 unlabelled selects/inputs (library sort, practice preset/difficulty, review
  assignee/drill, Insights filters, Profile timezone, Settings fields, Upload file input).
- "Skip to content" link + focusable `<main id="main-content">`.
- Global `prefers-reduced-motion` and `prefers-reduced-transparency` handling (glass falls back to a solid panel).
- Call Review had its own `<main>` nested in the shell's `<main>` (duplicate landmarks). Now a `<div data-review-shell>`; the Day 46 and Day 290 guards were re-pointed at it.

## 6. Production smoke list (after promotion; operator)

Reuse `SECURITY_ROLLOUT_CHECKLIST.md` §5 (a)–(h) first, then:

- Rep: sidebar shows Home, Calls, Practice, Coaching, Progress + Upload Call; each opens; active state follows back/forward.
- Manager: Overview, Team, Reviews, Assignments, Insights + Upload Call; **Reviews and Assignments** land on the right
  Command Centre tab, also when clicked while already on `/coaching`.
- Call Review (a scored call): header, score, one primary action, transcript readable, no blur inside the transcript.
- Practice: start a session, send a turn, end the round, confirm scoring renders.
- Upload: form fits a laptop screen; mobile has no sideways scroll.
- Browser console: no new errors; staging banner **absent** in production (`NEXT_PUBLIC_APP_ENV` must not be `staging`).

## 7. Usability tasks (acceptance criteria from the brief)

1. New rep finds and understands their latest call review without help.
2. Manager identifies who needs coaching and assigns the next action without help.
3. Participants explain what each primary nav item is for.
4. Each screen has one visually dominant next action.
Record hesitations per screen; fix recurring ones before promotion.

## 8. Known issues that are NOT part of this release (do not hide them)

- **Staging API `x-org-id` validation:** `src/routes/crm.ts` accepts only RFC-variant UUIDs, but staging seed org ids
  look like `00000000-2711-…`, so `/v1/crm/manager/control-centre` returns 400 on staging. The Overview now
  degrades with a notice instead of an error page. Production ids are random UUIDs and are not affected.
  The API fix is separate and was not made.
- Earlier, opening `/dashboard` directly bounced to `/login` and once showed `InvariantError: clientReferenceManifest`.
  Both occurred in the local **dev** server after code edits / a stale `.next`; a clean restart fixed them and a direct load
  now works for the rep. Treat as a dev-server artefact, but re-test a direct load on the hosted staging build.
- **API route shadowing:** `GET /v1/reps/me` is defined twice (`routes/reps.ts` flat shape wins over
  `routes/assignments.ts` `{ me: {…xp} }`). The web pages expected the second shape, so name, tier and points
  were silently missing on Home/Progress. WEB now accepts both shapes (greeting and tier chip work). XP totals are
  still absent until the API shadowing is resolved — separate API fix, not made here.
- `/crm/manager/*`, `/whisperer`, `/recent-calls`, `/review/*`, `/dev/*` were not redesigned (audit lists them as unclear).
- Profile and Admin Settings stay full-width: the page container's own max-width wins over `max-w-2xl`.
- The brief's rep "XP/streak" metric and badges were not added: the design system retires XP/streak in primary
  UI and there is no badge data.

## 9. Production env hygiene (from the security checklist — confirm, don't assume)

Must be **absent** in the production WEB env: `PROXY_DEV_X_ORG_ID`, `DEV_ORG_ID`, `NEXT_PUBLIC_TEST_ORG_ID`,
`PROXY_DEV_X_USER_ID`, `NEXT_PUBLIC_DEV_USER_ID`, `DEV_TEST_UID`, `NEXT_PUBLIC_APP_ENV=staging`.
Local-only launcher values used during verification never touch Vercel.
