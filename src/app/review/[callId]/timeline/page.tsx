// Production hotfix: this route fetched the API directly (bypassing /api/proxy, so it cannot authenticate against the hardened
// API). The real call review lives at /calls/[id]; redirect there, keeping the call id (same behaviour as later releases).
import { redirect } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ callId: string }> }) {
  const { callId } = await params;
  redirect(`/calls/${callId}`);
}
