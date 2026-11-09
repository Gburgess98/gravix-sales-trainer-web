import UnavailableRoute from '@/components/UnavailableRoute'

// Withheld from this release (src/config/release-hidden.ts): children are intentionally not rendered, so the page never mounts
// and sends no requests. The parent segment's RoleGate still applies first.
export default function Layout() {
  return <UnavailableRoute />
}
