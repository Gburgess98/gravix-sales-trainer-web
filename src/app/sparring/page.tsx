import { redirect } from 'next/navigation';

// Day 178 — /sparring has no index surface of its own; sparring sessions live in
// the Call Library sparring tab. A tiny redirect keeps every historical link working.
export default function SparringIndexPage() {
  redirect('/call-library?tab=sparring');
}
