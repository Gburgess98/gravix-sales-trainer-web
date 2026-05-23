import Link from 'next/link'

interface EmptyStateAction {
  label: string
  onClick?: () => void
  href?: string
}

interface EmptyStateProps {
  message: string
  sub?: string
  action?: EmptyStateAction
  className?: string
}

export function EmptyState({ message, sub, action, className }: EmptyStateProps) {
  return (
    <div className={`px-4 py-6 text-center ${className ?? ''}`}>
      <p className="text-sm text-neutral-400">{message}</p>
      {sub && <p className="mt-1 text-xs text-neutral-600">{sub}</p>}
      {action && (
        <div className="mt-3">
          {action.href ? (
            <Link
              href={action.href}
              className="inline-flex items-center rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-900 transition-colors"
            >
              {action.label}
            </Link>
          ) : (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex items-center rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-900 transition-colors"
            >
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// Inline variant — for table rows / list items (left-aligned, no centering)
export function EmptyRow({ message }: { message: string }) {
  return (
    <div className="px-4 py-4 text-sm text-neutral-400">{message}</div>
  )
}
