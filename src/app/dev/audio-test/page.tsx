// /src/app/dev/audio-test/page.tsx
//
// Day 231 UI audit — dev scratch page for signed-audio-URL testing with a
// hardcoded bucket path. It rendered OUTSIDE the shell gate (pre-shell header,
// unauthenticated), minting /api/audio-url requests for anyone who found the
// URL — a trust and surface-area hazard with zero product value. Real playback
// QA happens on /calls/[id]. Redirects to the dashboard (which routes through
// the auth gate). Kept as a redirect (rather than deleted) so any stray link
// lands on a real surface instead of a 404.

import { redirect } from "next/navigation";

export default function Page() {
  redirect("/dashboard");
}
