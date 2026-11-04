'use client'

import { useEffect } from 'react'

/* Page-level error boundary. Before this existed, any exception while rendering a route replaced the whole
   application with Next's generic "Application error" screen. This keeps the shell and offers a retry.
   It is a safety net, not a fix: root causes are fixed where they happen. The digest is shown only as a
   support reference (it is a hash, not the error text), and the raw message is never rendered. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Keep the real error in the console / logs for diagnosis.
    console.error(error)
  }, [error])

  return (
    <div role="alert" className="mx-auto max-w-md px-4 py-20 text-center">
      <p className="text-base font-semibold text-neutral-100">This page couldn’t load</p>
      <p className="mt-2 text-sm text-neutral-400">Something went wrong while opening it. Your data has not changed.</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-100 hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
      >
        Try again
      </button>
      {error.digest && <p className="mt-4 text-xs text-neutral-500">Reference {error.digest}</p>}
    </div>
  )
}
