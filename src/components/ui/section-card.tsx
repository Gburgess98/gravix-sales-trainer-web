import { clsx } from 'clsx'
import { ReactNode } from 'react'

export type SectionVariant = 'default' | 'ai' | 'rescue' | 'coaching' | 'warning' | 'danger'

// Day 203 — accent variants use semantic roles (brand/warning/danger); tokens
// alias indigo/amber/red 1:1. default + coaching stay on the neutral surface role.
const BORDER: Record<SectionVariant, string> = {
  default: 'border-neutral-800/70 bg-neutral-950',
  ai: 'border-brand-500/20 bg-brand-500/5',
  rescue: 'border-warning-500/20 bg-warning-500/5',
  // Day 196 — coaching sections are product areas, not statuses; emerald tint retired
  coaching: 'border-neutral-800/70 bg-neutral-950',
  warning: 'border-warning-500/20 bg-warning-500/5',
  danger: 'border-danger-500/20 bg-danger-500/5',
}

const DIVIDER: Record<SectionVariant, string> = {
  default: 'border-neutral-800',
  ai: 'border-brand-500/10',
  rescue: 'border-warning-500/10',
  coaching: 'border-neutral-800',
  warning: 'border-warning-500/10',
  danger: 'border-danger-500/10',
}

const EYEBROW_CLASS: Record<SectionVariant, string> = {
  default: 'text-neutral-500',
  ai: 'text-brand-300',
  rescue: 'text-warning-300',
  coaching: 'text-neutral-500',
  warning: 'text-warning-300',
  danger: 'text-danger-300',
}

interface SectionCardProps {
  variant?: SectionVariant
  eyebrow?: string
  title?: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
  /** Inset the body from the card edges. Off by default — list/table bodies manage their own padding. */
  padded?: boolean
}

export function SectionCard({
  variant = 'default',
  eyebrow,
  title,
  subtitle,
  actions,
  children,
  className,
  padded = false,
}: SectionCardProps) {
  const hasHeader = eyebrow || title || subtitle || actions
  return (
    <div className={clsx('rounded-xl border overflow-hidden shadow-md shadow-black/20', BORDER[variant], className)}>
      {hasHeader && (
        <div
          className={clsx(
            'flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b',
            DIVIDER[variant]
          )}
        >
          <div>
            {eyebrow && (
              <div
                className={clsx(
                  'text-[10px] uppercase tracking-[0.14em] mb-0.5',
                  EYEBROW_CLASS[variant]
                )}
              >
                {eyebrow}
              </div>
            )}
            {title && <div className="text-base font-semibold text-white">{title}</div>}
            {subtitle && <div className="mt-0.5 text-xs text-neutral-500">{subtitle}</div>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      {padded ? <div className="px-5 py-4">{children}</div> : children}
    </div>
  )
}

// Lightweight section header used inside existing card wrappers
interface SectionHeaderProps {
  title: string
  subtitle?: string
  actions?: ReactNode
  className?: string
}

export function SectionHeader({ title, subtitle, actions, className }: SectionHeaderProps) {
  return (
    <div
      className={clsx(
        'flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-neutral-800',
        className
      )}
    >
      <div>
        <div className="text-sm font-medium text-white">{title}</div>
        {subtitle && <div className="mt-0.5 text-xs text-neutral-500">{subtitle}</div>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
