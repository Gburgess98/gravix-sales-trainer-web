// /src/app/crm/actions/page.tsx
//
// Day 235 — this was the legacy standalone CRM actions list. The Day 231
// audit graded it C+ (no shell primitives, local layout) and it was fully
// orphaned: no sidebar entry and no inbound page links anywhere. Its job is
// covered by stronger surfaces — the CRM overview cockpit carries today's
// actions, and per-contact actions live on the contact detail page — so this
// redirects to the overview rather than keeping a duplicate half-surface a
// buyer could wander into. Kept as a redirect (rather than deleted) so any
// stray/bookmarked link lands on a real surface instead of a 404.

import { redirect } from "next/navigation";

export default function Page() {
  redirect("/crm/overview");
}
