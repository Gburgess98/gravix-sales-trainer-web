import Link from 'next/link'
import { dsButton } from '@/components/ds'

/* The call exists in principle but could not be loaded right now (network, server). Distinct from "not found":
   nothing is claimed about the call, there is no raw error, and the way forward is one retry or the library. */
export function CallLoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
      <Link href="/call-library" className="ds-focus inline-flex rounded text-sm text-[var(--ds-text-3)] hover:text-[var(--ds-text)]">← Call Library</Link>
      <div role="alert" className="ds-glass mx-auto mt-10 max-w-md rounded-[var(--ds-radius-card)] p-8 text-center">
        <h1 className="text-lg font-semibold text-[var(--ds-text)]">We couldn’t load this call</h1>
        <p className="mt-1.5 text-sm text-[var(--ds-text-2)]">This is usually temporary. Check your connection and try again. Nothing about the call has changed.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button type="button" onClick={onRetry} className={dsButton('primary', 'md')}>Try again</button>
          <Link href="/call-library" className={dsButton('secondary', 'md')}>Back to Calls</Link>
        </div>
      </div>
    </div>
  )
}
