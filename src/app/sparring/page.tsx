import ArenaClient from './ArenaClient'

// Staging prototype (branch claude/sparring-arena): /sparring now renders the Sparring Arena.
// To revert, restore the previous body of this file:
//   import { redirect } from 'next/navigation'
//   export default function SparringIndexPage() { redirect('/call-library?tab=sparring') }
// (Day 178: /sparring has no index surface of its own; sessions live in the Call Library Practice tab.)
export default function SparringIndexPage() {
  return <ArenaClient />
}
