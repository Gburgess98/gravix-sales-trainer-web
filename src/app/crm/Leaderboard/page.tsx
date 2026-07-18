// /src/app/crm/Leaderboard/page.tsx
//
// Day 231 UI audit — legacy case-sensitive leaderboard page (raw apiGet to
// /dashboard/leaderboard, arcade framing, pre-shell layout). Orphaned since the
// CRM workspace consolidation: no nav entry and no inbound page links (noted as
// a known orphan on Day 187/205A). Rep performance now lives in the manager
// surfaces, so this redirects to the CRM overview cockpit. Kept as a redirect
// (rather than deleted) so any stray/bookmarked link lands on a real surface
// instead of a 404.

import { redirect } from "next/navigation";

export default function Page() {
  redirect("/crm/overview");
}
