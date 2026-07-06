import { redirect } from 'next/navigation'

// Day 188 — orphaned auto-assign run detail (no inbound navigation). Run history
// now lives on the Team page (/crm/manager), so this route redirects there.
export default function AutoAssignRunDetailRedirect() {
  redirect('/crm/manager')
}
