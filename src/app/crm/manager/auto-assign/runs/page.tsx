import { redirect } from 'next/navigation'

// Day 188 — orphaned auto-assign runs list (no inbound navigation). The live
// run history lives on the Team page (/crm/manager), so this route redirects
// there rather than maintaining a duplicate surface.
export default function AutoAssignRunsRedirect() {
  redirect('/crm/manager')
}
