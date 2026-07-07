// /src/app/reps/[id]/sparring/page.tsx
//
// Day 193 — this legacy rep sparring-session list was only reachable from the
// now-redirected /reps/[id] parent (a closed orphan loop; no other inbound
// links). The active rep surface is /crm/reps/[id], whose Coaching tab carries
// the sparring score trend and AI Sparring entry points. This redirects there
// (rather than deep-linking the sparring engine, which would risk launching a
// session), preserving the rep id. Kept as a redirect so any stray/bookmarked
// link lands on the real path instead of a 404.

import { redirect } from "next/navigation";

export default function Page({ params }: { params: { id: string } }) {
  redirect(`/crm/reps/${encodeURIComponent(params.id)}`);
}
