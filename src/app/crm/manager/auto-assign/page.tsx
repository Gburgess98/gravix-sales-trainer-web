import { redirect } from 'next/navigation'

// Day 188 — this orphaned, light-themed auto-assign page bypassed /api/proxy
// (via NEXT_PUBLIC_API_URL) and had no inbound navigation. The live auto-assign
// UI (run history, preview/execute) lives on the Team page (/crm/manager) via
// ManagerClient + RunHistoryTable, so this route now redirects there.
export default function AutoAssignRedirect() {
  redirect('/crm/manager')
}
