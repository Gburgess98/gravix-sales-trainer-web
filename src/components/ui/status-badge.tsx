import { clsx } from 'clsx'

// ── Risk band badge (healthy / watch / at_risk) ──

type RiskBand = 'healthy' | 'watch' | 'at_risk' | string

// Day 203 — status colours via semantic tokens (success/warning/danger/accent).
// Tokens alias emerald/amber/red/cyan 1:1; badges stay status-only by design.
const RISK_STYLES: Record<string, string> = {
  healthy: 'border-success-500/30 bg-success-500/10 text-success-300',
  watch: 'border-warning-500/30 bg-warning-500/10 text-warning-300',
  at_risk: 'border-danger-500/30 bg-danger-500/10 text-danger-300',
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
  critical: 'border-danger-500/30 bg-danger-500/10 text-danger-300',
  high: 'border-warning-500/30 bg-warning-500/10 text-warning-300',
  medium: 'border-accent-500/30 bg-accent-500/10 text-accent-300',
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
  assigned: 'border-success-500/30 bg-success-500/10 text-success-300',
  active: 'border-success-500/30 bg-success-500/10 text-success-300',
  completed: 'border-success-500/30 bg-success-500/10 text-success-300',
  healthy: 'border-success-500/30 bg-success-500/10 text-success-300',
  open: 'border-neutral-700 bg-neutral-900 text-neutral-300',
  unassigned: 'border-warning-500/30 bg-warning-500/10 text-warning-300',
  watch: 'border-warning-500/30 bg-warning-500/10 text-warning-300',
  overdue: 'border-danger-500/30 bg-danger-500/10 text-danger-300',
  at_risk: 'border-danger-500/30 bg-danger-500/10 text-danger-300',
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
  // Day 203 — score bands via success/warning/danger tokens (alias emerald/amber/red).
  const cls =
    n >= 80 ? 'bg-success-600/20 text-success-400'
      : n >= 60 ? 'bg-warning-600/20 text-warning-300'
        : 'bg-danger-600/20 text-danger-300'
  return (
    <span className={clsx('text-xs px-2 py-1 rounded tabular-nums font-medium', cls, className)}>
      {n}
    </span>
  )
}
