import { clsx } from 'clsx'

type StatVariant = 'default' | 'danger' | 'warning' | 'success' | 'ai' | 'info'

const BORDER_CLASS: Record<StatVariant, string> = {
  default: 'border-neutral-800/70 bg-neutral-950',
  danger: 'border-red-500/20 bg-red-500/5',
  warning: 'border-amber-500/20 bg-amber-500/5',
  success: 'border-emerald-500/20 bg-emerald-500/5',
  ai: 'border-indigo-500/20 bg-indigo-500/5',
  info: 'border-cyan-500/20 bg-cyan-500/5',
}

const VALUE_CLASS: Record<StatVariant, string> = {
  default: 'text-white',
  danger: 'text-red-300',
  warning: 'text-amber-300',
  success: 'text-emerald-300',
  ai: 'text-indigo-300',
  info: 'text-cyan-300',
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
