// /src/app/review/[callId]/timeline/page.tsx
//
// Day 184 — this route used to fetch the API directly (bypassing the
// /api/proxy boundary) and render a transcript player with props the shared
// component no longer accepts. It was orphaned (no inbound links).
// The real call review page is /calls/[id], so this now redirects there,
// preserving the callId. Kept as a redirect (rather than deleted) so any
// stray/bookmarked link lands on the real path instead of a 404.

import { redirect } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ callId: string }> }) {
  const { callId } = await params;
  redirect(`/calls/${callId}`);
}
