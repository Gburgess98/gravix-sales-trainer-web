import { clsx } from 'clsx'

interface PageHeaderProps {
  title: string
  subtitle?: string
  eyebrow?: string
  /** One visually dominant primary action per page goes here; the rest stay secondary. */
  actions?: React.ReactNode
  /** Translucent summary band (staging redesign pilot). Header copy only — never wrap data or forms in it. */
  glass?: boolean
  className?: string
}

// Day 45 — consistent title / subtitle / action placement. Actions wrap under the
// title on narrow screens instead of squeezing it.
export function PageHeader({ title, subtitle, eyebrow, actions, glass, className }: PageHeaderProps) {
  return (
    <div
      className={clsx(
        'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        glass && 'glass rounded-2xl px-5 py-4',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className={clsx('text-[11px] font-medium uppercase tracking-[0.12em]', glass ? 'text-neutral-400' : 'text-neutral-500')}>
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        {subtitle && (
          <p className="mt-1 max-w-2xl text-sm text-neutral-400">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">{actions}</div>
      )}
    </div>
  )
}
