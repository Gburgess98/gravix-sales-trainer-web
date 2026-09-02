// /src/app/reps/[id]/page.tsx
//
// Day 193 — this was the legacy non-CRM rep profile (a large standalone client
// page predating the CRM workspace). It was orphaned: no inbound page links
// anywhere except its own /reps/[id]/sparring child. The active rep profile is
// /crm/reps/[id] (param-compatible — same rep id), so this now redirects there,
// preserving the id. Kept as a redirect (rather than deleted) so any
// stray/bookmarked link lands on the real path instead of a 404.

import { redirect } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/crm/reps/${encodeURIComponent(id)}`);
}
