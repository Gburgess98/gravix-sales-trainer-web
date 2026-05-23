import { clsx } from 'clsx'

type FilterVariant = 'default' | 'danger' | 'warning' | 'success' | 'info'

const ACTIVE_STYLES: Record<FilterVariant, string> = {
  default: 'border-neutral-100 bg-neutral-100 text-neutral-900',
  danger: 'border-red-400 bg-red-500/20 text-red-200',
  warning: 'border-amber-400 bg-amber-500/20 text-amber-200',
  success: 'border-emerald-400 bg-emerald-500/20 text-emerald-200',
  info: 'border-cyan-400 bg-cyan-500/20 text-cyan-200',
}

export interface FilterOption<T extends string = string> {
  value: T
  label: string
  variant?: FilterVariant
}

interface FilterBarProps<T extends string = string> {
  options: FilterOption<T>[]
  value: T
  onChange: (value: T) => void
  count?: number
  countLabel?: string
  className?: string
}

export function FilterBar<T extends string = string>({
  options,
  value,
  onChange,
  count,
  countLabel,
  className,
}: FilterBarProps<T>) {
  return (
    <div className={clsx('flex items-center gap-2 flex-wrap', className)}>
      {options.map((opt) => {
        const isActive = value === opt.value
        const activeStyle = ACTIVE_STYLES[opt.variant ?? 'default']
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={clsx(
              'rounded-full border px-3 py-1 text-xs transition-colors',
              isActive
                ? activeStyle
                : 'border-neutral-700 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-300'
            )}
          >
            {opt.label}
          </button>
        )
      })}
      {count !== undefined && countLabel && (
        <span className="ml-auto text-xs text-neutral-500">
          {count} {countLabel}
        </span>
      )}
    </div>
  )
}
