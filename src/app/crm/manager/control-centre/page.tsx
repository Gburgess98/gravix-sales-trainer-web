import { redirect } from 'next/navigation'

// This page has been consolidated into the Coaching Command Centre.
export default function ControlCentreRedirect() {
  redirect('/coaching')
}
