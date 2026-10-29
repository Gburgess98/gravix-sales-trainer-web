import { clsx } from 'clsx'
import { ReactNode } from 'react'

interface DisclosureProps {
  title: string
  /** Short hint shown beside the title (e.g. what is inside). */
  hint?: string
  children: ReactNode
  /** Collapsed by default: progressive disclosure for secondary detail. */
  defaultOpen?: boolean
  className?: string
}

// Day 45 — native <details>: keyboard and screen-reader accessible with no JS state,
// no dependency and no motion. Used to tuck secondary sections behind a clear label.
export function Disclosure({ title, hint, children, defaultOpen = false, className }: DisclosureProps) {
  return (
    <details
      open={defaultOpen}
      className={clsx('group rounded-xl border border-neutral-800/70 bg-neutral-950', className)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-5 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/70 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-white">{title}</span>
          {hint && <span className="mt-0.5 block text-xs text-neutral-500">{hint}</span>}
        </span>
        <span aria-hidden className="shrink-0 text-xs text-neutral-500 group-open:rotate-180 transition-transform motion-reduce:transition-none">▾</span>
      </summary>
      <div className="space-y-4 border-t border-neutral-800/70 p-5">{children}</div>
    </details>
  )
}
