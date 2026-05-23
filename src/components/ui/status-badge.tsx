import { clsx } from 'clsx'

// ── Risk band badge (healthy / watch / at_risk) ──

type RiskBand = 'healthy' | 'watch' | 'at_risk' | string

const RISK_STYLES: Record<string, string> = {
  healthy: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  watch: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  at_risk: 'border-red-500/30 bg-red-500/10 text-red-300',
}

const RISK_LABELS: Record<string, string> = {
  healthy: 'Healthy',
  watch: 'Watch',
  at_risk: 'At Risk',
}

interface RiskBadgeProps {
  band: RiskBand
  score?: number
  size?: 'sm' | 'md'
  className?: string
}

export function RiskBadge({ band, score, size = 'sm', className }: RiskBadgeProps) {
  const styles = RISK_STYLES[band] ?? RISK_STYLES.healthy
  const label = RISK_LABELS[band] ?? band
  return (
    <span
      className={clsx(
        'rounded-full border font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]' : 'px-2.5 py-1 text-xs',
        styles,
        className
      )}
    >
      {label}{score !== undefined ? ` · ${score}/100` : ''}
    </span>
  )
}

// ── Urgency badge (critical / high / medium / low) ──

type UrgencyLevel = 'critical' | 'high' | 'medium' | 'low' | string

const URGENCY_STYLES: Record<string, string> = {
  critical: 'border-red-500/30 bg-red-500/10 text-red-300',
  high: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  medium: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300',
  low: 'border-neutral-700 bg-neutral-900 text-neutral-400',
}

interface UrgencyBadgeProps {
  urgency: UrgencyLevel
  size?: 'sm' | 'md'
  className?: string
}

export function UrgencyBadge({ urgency, size = 'sm', className }: UrgencyBadgeProps) {
  const styles = URGENCY_STYLES[urgency] ?? URGENCY_STYLES.medium
  return (
    <span
      className={clsx(
        'rounded-full border uppercase tracking-[0.12em]',
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs',
        styles,
        className
      )}
    >
      {urgency}
    </span>
  )
}

// ── Generic status badge (assigned / open / completed / overdue …) ──

const STATUS_STYLES: Record<string, string> = {
  assigned: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  active: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  completed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  healthy: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
  open: 'border-neutral-700 bg-neutral-900 text-neutral-300',
  unassigned: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  watch: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  overdue: 'border-red-500/30 bg-red-500/10 text-red-300',
  at_risk: 'border-red-500/30 bg-red-500/10 text-red-300',
}

const STATUS_LABELS: Record<string, string> = {
  at_risk: 'At Risk',
  unassigned: 'Unassigned',
}

interface StatusBadgeProps {
  status: string
  label?: string
  size?: 'sm' | 'md'
  className?: string
}

export function StatusBadge({ status, label, size = 'sm', className }: StatusBadgeProps) {
  const styles = STATUS_STYLES[status] ?? 'border-neutral-700 bg-neutral-900 text-neutral-400'
  const displayLabel = label ?? STATUS_LABELS[status] ?? status
  return (
    <span
      className={clsx(
        'rounded-full border capitalize',
        size === 'sm' ? 'px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]' : 'px-2.5 py-1 text-xs font-medium',
        styles,
        className
      )}
    >
      {displayLabel}
    </span>
  )
}

// ── Score pill (numeric score colour) ──

interface ScorePillProps {
  score: number | null | undefined
  className?: string
}

export function ScorePill({ score, className }: ScorePillProps) {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return <span className={clsx('text-xs opacity-60', className)}>—</span>
  }
  const n = Math.round(score)
  const cls =
    n >= 80 ? 'bg-emerald-600/20 text-emerald-400'
      : n >= 60 ? 'bg-amber-600/20 text-amber-300'
        : 'bg-red-600/20 text-red-300'
  return (
    <span className={clsx('text-xs px-2 py-1 rounded tabular-nums font-medium', cls, className)}>
      {n}
    </span>
  )
}
