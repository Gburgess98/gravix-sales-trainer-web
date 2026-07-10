import { clsx } from 'clsx'

type StatVariant = 'default' | 'danger' | 'warning' | 'success' | 'ai' | 'info'

// Day 203 — semantic colour roles (danger/warning/success/brand/accent). Tokens
// alias the prior red/amber/emerald/indigo/cyan palette 1:1; surface stays neutral.
const BORDER_CLASS: Record<StatVariant, string> = {
  default: 'border-neutral-800/70 bg-neutral-950',
  danger: 'border-danger-500/20 bg-danger-500/5',
  warning: 'border-warning-500/20 bg-warning-500/5',
  success: 'border-success-500/20 bg-success-500/5',
  ai: 'border-brand-500/20 bg-brand-500/5',
  info: 'border-accent-500/20 bg-accent-500/5',
}

const VALUE_CLASS: Record<StatVariant, string> = {
  default: 'text-white',
  danger: 'text-danger-300',
  warning: 'text-warning-300',
  success: 'text-success-300',
  ai: 'text-brand-300',
  info: 'text-accent-300',
}

interface StatCardProps {
  label: string
  value: string | number
  subtext?: string
  variant?: StatVariant
  valueClass?: string
  size?: 'sm' | 'md'
  className?: string
}

export function StatCard({
  label,
  value,
  subtext,
  variant = 'default',
  valueClass,
  size = 'md',
  className,
}: StatCardProps) {
  return (
    <div className={clsx('rounded-xl border px-4 py-3 shadow-md shadow-black/20', BORDER_CLASS[variant], className)}>
      <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">{label}</div>
      <div
        className={clsx(
          'tabular-nums font-semibold',
          size === 'md' ? 'mt-1.5 text-2xl' : 'mt-1 text-lg',
          valueClass ?? VALUE_CLASS[variant]
        )}
      >
        {value}
      </div>
      {subtext && (
        <div className="mt-0.5 text-[10px] text-neutral-500">{subtext}</div>
      )}
    </div>
  )
}
