import { clsx } from 'clsx'

type StatVariant = 'default' | 'danger' | 'warning' | 'success' | 'ai' | 'info'

const VALUE_CLASS: Record<StatVariant, string> = {
  default: 'text-white',
  danger: 'text-red-300',
  warning: 'text-amber-300',
  success: 'text-emerald-300',
  ai: 'text-fuchsia-300',
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
    <div className={clsx('rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3', className)}>
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
