// /src/app/rewards/page.tsx
//
// Day 231 UI audit — this was the legacy arcade rewards page (titles/bounties,
// a hardcoded placeholder user id, and imports of getRewards/listActiveBounties
// which no longer exist in lib/api, so its data calls could only throw). It was
// orphaned: no nav entry and no inbound page links. The dashboard is where
// progress/recognition now lives (arcade language was reframed on Day 201), so
// this redirects there. Kept as a redirect (rather than deleted) so any
// stray/bookmarked link lands on a real surface instead of a 404.

import { redirect } from "next/navigation";

export default function Page() {
  redirect("/dashboard");
}
