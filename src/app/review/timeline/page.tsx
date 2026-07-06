// /src/app/review/timeline/page.tsx
//
// Day 184 — this route used to render a self-contained demo transcript player
// backed by mock data and an external audio placeholder. It was orphaned (no
// inbound links) and created trust/UX confusion. The real Review Queue lives at
// /coaching?tab=review, so this now redirects there instead of exposing mock
// data. Kept as a redirect (rather than deleted) so any stray/bookmarked link
// lands on the real path instead of a 404.

import { redirect } from "next/navigation";

export default function Page() {
  redirect("/coaching?tab=review");
}
