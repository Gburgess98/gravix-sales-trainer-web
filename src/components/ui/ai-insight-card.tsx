import { clsx } from 'clsx'

type InsightType = 'summary' | 'recommendation' | 'next-action' | 'warning' | 'escalation'

interface InsightStyle {
  border: string
  eyebrow: string
  dot: string
}

const STYLES: Record<InsightType, InsightStyle> = {
  summary: {
    border: 'border-fuchsia-500/20 bg-fuchsia-500/5',
    eyebrow: 'text-fuchsia-300',
    dot: 'bg-fuchsia-500',
  },
  recommendation: {
    border: 'border-cyan-500/20 bg-cyan-500/5',
    eyebrow: 'text-cyan-300',
    dot: 'bg-cyan-500',
  },
  'next-action': {
    border: 'border-emerald-500/20 bg-emerald-500/5',
    eyebrow: 'text-emerald-300',
    dot: 'bg-emerald-500',
  },
  warning: {
    border: 'border-amber-500/20 bg-amber-500/5',
    eyebrow: 'text-amber-300',
    dot: 'bg-amber-500',
  },
  escalation: {
    border: 'border-red-500/20 bg-red-500/5',
    eyebrow: 'text-red-300',
    dot: 'bg-red-500',
  },
}

const DEFAULT_LABELS: Record<InsightType, string> = {
  summary: 'AI Summary',
  recommendation: 'AI Recommendation',
  'next-action': 'Next Best Action',
  warning: 'AI Warning',
  escalation: 'Escalation Required',
}

interface AiInsightCardProps {
  type?: InsightType
  label?: string
  content: string
  className?: string
}

export function AiInsightCard({
  type = 'summary',
  label,
  content,
  className,
}: AiInsightCardProps) {
  const s = STYLES[type]
  return (
    <div className={clsx('rounded-xl border px-4 py-3 flex items-start gap-3', s.border, className)}>
      <div className={clsx('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', s.dot)} />
      <div className="flex-1 min-w-0">
        <div className={clsx('text-[10px] uppercase tracking-[0.14em] mb-1', s.eyebrow)}>
          {label ?? DEFAULT_LABELS[type]}
        </div>
        <p className="text-sm text-neutral-300 leading-relaxed">{content}</p>
      </div>
    </div>
  )
}

// Inline list item variant — for use inside SectionCard lists
interface AiInsightItemProps {
  content: string
  type?: 'flag' | 'rec' | 'escalation'
  className?: string
}

const ITEM_STYLES: Record<NonNullable<AiInsightItemProps['type']>, string> = {
  flag: 'border-red-500/20 bg-red-500/5 text-red-200',
  rec: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-100',
  escalation: 'border-red-500/20 bg-red-500/5 text-red-100',
}

export function AiInsightItem({ content, type = 'rec', className }: AiInsightItemProps) {
  return (
    <div
      className={clsx(
        'rounded-lg border px-3 py-2 text-xs leading-relaxed',
        ITEM_STYLES[type],
        className
      )}
    >
      {content}
    </div>
  )
}
