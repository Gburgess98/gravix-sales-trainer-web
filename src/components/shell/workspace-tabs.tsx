'use client'

import { clsx } from 'clsx'

export interface WorkspaceTab<T extends string = string> {
  id: T
  label: string
  badge?: number | string
}

interface WorkspaceTabsProps<T extends string = string> {
  tabs: WorkspaceTab<T>[]
  active: T
  onChange: (tab: T) => void
  className?: string
}

export function WorkspaceTabs<T extends string = string>({
  tabs,
  active,
  onChange,
  className,
}: WorkspaceTabsProps<T>) {
  return (
    <div className={clsx('flex items-end gap-0 border-b border-neutral-800/80 mb-5', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={clsx(
            'relative px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap',
            active === tab.id
              // Day 203 — brand token (aliases indigo-400); active underline unchanged.
              ? 'border-brand-400 text-white'
              : 'border-transparent text-neutral-500 hover:text-neutral-300 hover:border-neutral-700',
          )}
        >
          {tab.label}
          {tab.badge != null && tab.badge !== 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400 tabular-nums">
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
