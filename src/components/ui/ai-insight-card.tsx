import { clsx } from 'clsx'

type InsightType = 'summary' | 'recommendation' | 'next-action' | 'warning' | 'escalation'

interface InsightStyle {
  border: string
  eyebrow: string
  dot: string
}

// Day 203 — semantic colour roles (brand/accent/success/warning/danger). Tokens
// alias the prior indigo/cyan/emerald/amber/red palette 1:1, so output is unchanged.
const STYLES: Record<InsightType, InsightStyle> = {
  summary: {
    border: 'border-brand-500/20 bg-brand-500/5',
    eyebrow: 'text-brand-300',
    dot: 'bg-brand-500',
  },
  recommendation: {
    border: 'border-accent-500/20 bg-accent-500/5',
    eyebrow: 'text-accent-300',
    dot: 'bg-accent-500',
  },
  'next-action': {
    border: 'border-success-500/20 bg-success-500/5',
    eyebrow: 'text-success-300',
    dot: 'bg-success-500',
  },
  warning: {
    border: 'border-warning-500/20 bg-warning-500/5',
    eyebrow: 'text-warning-300',
    dot: 'bg-warning-500',
  },
  escalation: {
    border: 'border-danger-500/20 bg-danger-500/5',
    eyebrow: 'text-danger-300',
    dot: 'bg-danger-500',
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
  flag: 'border-danger-500/20 bg-danger-500/5 text-danger-200',
  rec: 'border-success-500/20 bg-success-500/5 text-success-100',
  escalation: 'border-danger-500/20 bg-danger-500/5 text-danger-100',
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
