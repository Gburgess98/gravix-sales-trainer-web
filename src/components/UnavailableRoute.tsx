import Link from 'next/link'
import { EmptyPanel, Panel, PageShell, dsButton } from '@/components/ds'

/** Calm result for a route withheld from this release (see src/config/release-hidden.ts). Static: no data, no requests. */
export default function UnavailableRoute() {
  return (
    <PageShell narrow>
      <Panel>
        <EmptyPanel
          title="This page isn’t available yet"
          body="It isn’t part of this release. Everything else in your workspace works as usual."
          action={<Link href="/" className={dsButton('secondary', 'md')}>Back to your workspace</Link>}
        />
      </Panel>
    </PageShell>
  )
}
