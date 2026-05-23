import { clsx } from 'clsx'

function Shimmer({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded bg-neutral-800/60', className)} />
}

// Single list row skeleton
export function SkeletonRow({ cols = 3 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <Shimmer className="h-4 flex-1" />
      {cols > 1 && <Shimmer className="h-4 w-24" />}
      {cols > 2 && <Shimmer className="h-4 w-16" />}
    </div>
  )
}

// KPI/stat card skeleton
export function SkeletonStat({ className }: { className?: string }) {
  return (
    <div className={clsx('rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3', className)}>
      <Shimmer className="h-3 w-20 mb-2" />
      <Shimmer className="h-8 w-16" />
    </div>
  )
}

// Table rows skeleton
export function SkeletonTable({ rows = 5, cols = 3 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-neutral-800">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} cols={cols} />
      ))}
    </div>
  )
}

// Workspace card skeleton
export function SkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={clsx('rounded-xl border border-neutral-800 bg-neutral-950 p-4 space-y-3', className)}>
      <Shimmer className="h-4 w-32" />
      {Array.from({ length: lines }).map((_, i) => (
        <Shimmer key={i} className={`h-3 ${i === lines - 1 ? 'w-3/4' : 'w-full'}`} />
      ))}
    </div>
  )
}

// Inline text loading — for use inside lists/panels
export function LoadingText({ text = 'Loading…' }: { text?: string }) {
  return <div className="px-4 py-5 text-sm text-neutral-400">{text}</div>
}
