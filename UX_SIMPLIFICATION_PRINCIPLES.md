# UX Simplification Principles

Day 161 — Demo Readiness / Lighthouse Prep

## 1. Problem observed

The system is powerful but feels too busy, loud, and confusing — "like I'm at the
arcade". Concretely:

- Too many equal-weight cards, badges, and colours competing for attention.
- **Upload Call was hard to find.** Even the founder struggled to locate it. There
  was no sidebar entry and no Upload CTA on the Command Centre.
- A manager should not have to hunt for core actions like uploading a call.

If the founder cannot find upload, an end user or lighthouse client will struggle.

## 2. Design principles

- **One obvious primary action** per page (on `/coaching` this is Upload Call).
- **One secondary action** (e.g. Review Calls / Coaching Queue).
- **Max three competing elements above the fold.** Everything else sits below.
- Calm visual hierarchy — primary action stands out without shouting.
- Fewer badges. Fewer colours competing for the eye.
- Every section should answer three questions: *what is this, why does it matter,
  what do I do next?*
- **The manager stays in control** — nothing is auto-created, auto-activated, or
  auto-completed. Gravix coaches; the manager decides.
- **Core actions like Upload Call must be visible from primary manager routes** —
  not buried behind tabs or deep links.
- **Ask "who is this call for?" before technical file details.** Structure a flow
  around the user's intent (rep + account) first, then context, then the file.
- **Prefer structured linking over loose labels** — link to real reps and accounts
  so calls land in the right review/coaching queues, with free text only as a
  fallback.
- **Forms should fit on a normal laptop screen where possible** — core workflows
  should not require zooming out to see the whole form.
- **Avoid stacking too many large cards for simple workflows** — group related
  fields inside one card rather than one bordered card per step.
- **If a dropdown can be empty, provide a create/add fallback** — a clear way to
  create the missing record, plus a temporary free-text label so the flow is never
  hard-blocked.
- **Compact does not mean tiny.** Shrinking a form until it floats in the centre of
  an empty desktop screen is not the goal — readability and rhythm matter.
- **Desktop pages should use space intentionally** — use the available width
  deliberately rather than leaving large dead empty space.
- **Use side panels for guidance instead of stretching forms** — a calm right-hand
  panel ("what happens next", tips, secondary actions) fills the width without
  making inputs awkwardly wide.
- **Error messages should explain what happened and what to do next** — say what
  succeeded, what failed, the reason, and the recovery action (e.g. retry).

## 3. Manager navigation model

1. Command Centre (`/coaching`)
2. Upload Call (`/upload`)
3. Review Calls (Review Queue tab)
4. Coaching Queue (`#coaching-queue`)
5. Sparring (`#queue-sparring`)
6. AI Discovery (`#ai-discovery`)

This same order is reflected in the calm "Manager workflow" strip on `/coaching`
and Upload Call now appears in the sidebar.

## 4. What to avoid

- The arcade / control-panel feeling — walls of glowing cards and badges.
- Adding features without simplifying the navigation around them.
- Hiding core actions like upload behind tabs or deep links.
- Too many equal-weight CTAs — if everything is primary, nothing is.

## 5. Future UX debt

- Simplify the sidebar / navigation further.
- Reduce visual noise across cards (fewer tones, calmer spacing).
- Create calmer design tokens.
- First-time manager walkthrough.
- Demo mode data seeding.

## Product framing

Gravix does not own the call. Gravix listens to the call, coaches the rep, scores
the session, and trains the team.
