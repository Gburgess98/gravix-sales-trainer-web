import { clsx } from 'clsx'
import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Tone } from '@/lib/ds-model'

/* Gravix design system v2 primitives. Glass = chrome (headers, filters, summary cards).
   Panel = anything people read or work in. See globals.css "design system v2". */

export function PageShell({ children, className, narrow }: { children: ReactNode; className?: string; narrow?: boolean }) {
  return (
    <div className={clsx('mx-auto w-full space-y-8 px-4 py-8 sm:px-6 lg:px-10 lg:py-12', narrow ? 'max-w-3xl' : 'max-w-6xl', className)}>
      {children}
    </div>
  )
}

export function PageHead({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-medium uppercase tracking-wider text-[var(--ds-text-3)]">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ds-text)] sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-[var(--ds-text-2)]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/** Translucent summary card. Use for headline summaries and filters, never for long-form reading. */
export function GlassCard({ children, className, as: Tag = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'aside' }) {
  return <Tag className={clsx('ds-glass rounded-[var(--ds-radius-card)] p-5 sm:p-6', className)}>{children}</Tag>
}

/** Opaque content surface for transcripts, lists, forms, detail. */
export function Panel({ children, className, as: Tag = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' }) {
  return <Tag className={clsx('ds-panel rounded-[var(--ds-radius-card)]', className)}>{children}</Tag>
}

export function SectionTitle({ children, hint, action }: { children: ReactNode; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-[var(--ds-text)]">{children}</h2>
        {hint && <p className="mt-0.5 text-sm text-[var(--ds-text-3)]">{hint}</p>}
      </div>
      {action}
    </div>
  )
}

/** Header row for a Panel: title left, optional meta/action right. Pairs with `<Panel>` for work surfaces. */
export function PanelHeader({ title, meta, action }: { title: string; meta?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ds-border)] px-5 py-4 sm:px-6">
      <div className="flex items-baseline gap-3">
        <h2 className="text-base font-semibold text-[var(--ds-text)]">{title}</h2>
        {meta && <span className="text-xs text-[var(--ds-text-3)]">{meta}</span>}
      </div>
      {action}
    </div>
  )
}

/** Text input / select styling shared by forms inside panels. */
export const dsField =
  'ds-focus w-full rounded-[var(--ds-radius-control)] border border-[var(--ds-border)] bg-[var(--ds-bg)] px-3 py-2 text-sm text-[var(--ds-text)] placeholder:text-[var(--ds-text-3)]'

export function Metric({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <GlassCard as="div" className="!p-4 sm:!p-5">
      <p className="text-xs font-medium text-[var(--ds-text-3)]">{label}</p>
      <p className="mt-1.5 text-3xl font-semibold tabular-nums tracking-tight text-[var(--ds-text)]">{value}</p>
      {note && <p className="mt-1 text-xs text-[var(--ds-text-3)]">{note}</p>}
    </GlassCard>
  )
}

const TONE: Record<Tone, string> = {
  neutral: 'bg-white/[0.06] text-[var(--ds-text-2)] ring-white/10',
  info: 'bg-sky-400/10 text-sky-200 ring-sky-300/20',
  good: 'bg-emerald-400/10 text-emerald-200 ring-emerald-300/20',
  warn: 'bg-amber-400/10 text-amber-200 ring-amber-300/20',
  bad: 'bg-red-400/10 text-red-200 ring-red-300/20',
}
/** Status colour is reserved for meaning: good/warn/bad only for real state, never decoration. */
export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={clsx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONE[tone])}>{children}</span>
}

const BTN_BASE = 'ds-focus inline-flex items-center justify-center gap-2 rounded-[var(--ds-radius-control)] font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none motion-reduce:transition-none'
const BTN_SIZE = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-sm' }
const BTN_VARIANT = {
  primary: 'bg-[var(--ds-primary)] text-white hover:bg-[var(--ds-primary-hover)]',
  secondary: 'border border-[var(--ds-border-strong)] bg-white/[0.04] text-[var(--ds-text)] hover:bg-white/[0.08]',
  quiet: 'text-[var(--ds-text-2)] hover:bg-white/[0.06] hover:text-[var(--ds-text)]',
}
export function dsButton(variant: keyof typeof BTN_VARIANT = 'secondary', size: keyof typeof BTN_SIZE = 'md', className?: string) {
  return clsx(BTN_BASE, BTN_SIZE[size], BTN_VARIANT[variant], className)
}

/** Link-based tabs (route navigation). */
export function TabLinks({ tabs, label }: { tabs: { href: string; label: string; active: boolean }[]; label: string }) {
  return (
    <nav aria-label={label} className="flex gap-1 border-b border-[var(--ds-border)]">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={t.active ? 'page' : undefined}
          className={clsx(
            'ds-focus -mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors motion-reduce:transition-none',
            t.active ? 'border-[var(--ds-highlight)] text-[var(--ds-text)]' : 'border-transparent text-[var(--ds-text-3)] hover:text-[var(--ds-text)]'
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}

/** Segmented filter control (single choice), a11y via aria-pressed buttons. */
export function Segmented<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-[var(--ds-radius-control)] border border-[var(--ds-border)] bg-white/[0.03] p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'ds-focus rounded-[calc(var(--ds-radius-control)-2px)] px-3 py-1.5 text-sm transition-colors motion-reduce:transition-none',
            o.value === value ? 'bg-white/[0.1] text-[var(--ds-text)]' : 'text-[var(--ds-text-3)] hover:text-[var(--ds-text)]'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return (
    <input
      type="search"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="ds-focus w-full rounded-[var(--ds-radius-control)] border border-[var(--ds-border)] bg-[var(--ds-panel)] px-3 py-2 text-sm text-[var(--ds-text)] placeholder:text-[var(--ds-text-3)]"
    />
  )
}

/** Row list inside a Panel: one divided row per record, whole row is the link. */
export function DataList({ children, label }: { children: ReactNode; label: string }) {
  return <ul aria-label={label} className="divide-y divide-[var(--ds-border)]">{children}</ul>
}
export function DataRow({ href, title, meta, trailing }: { href: string; title: ReactNode; meta?: ReactNode; trailing?: ReactNode }) {
  return (
    <li>
      <Link href={href} className="ds-focus flex items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-white/[0.03] motion-reduce:transition-none sm:px-5">
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-[var(--ds-text)]">{title}</span>
          {meta && <span className="mt-0.5 block truncate text-xs text-[var(--ds-text-3)]">{meta}</span>}
        </span>
        {trailing && <span className="flex shrink-0 items-center gap-3">{trailing}</span>}
      </Link>
    </li>
  )
}

export function EmptyPanel({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="text-sm font-medium text-[var(--ds-text)]">{title}</p>
      {body && <p className="mx-auto mt-1.5 max-w-sm text-sm text-[var(--ds-text-3)]">{body}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}

export function ErrorPanel({ title = 'Something went wrong', body, onRetry }: { title?: string; body?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="px-6 py-12 text-center">
      <p className="text-sm font-medium text-red-200">{title}</p>
      {body && <p className="mx-auto mt-1.5 max-w-sm text-sm text-[var(--ds-text-3)]">{body}</p>}
      {onRetry && (
        <div className="mt-5 flex justify-center">
          <button type="button" onClick={onRetry} className={dsButton('secondary', 'sm')}>Try again</button>
        </div>
      )}
    </div>
  )
}

export function LoadingRows({ rows = 5, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="divide-y divide-[var(--ds-border)]">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="space-y-2">
            <div className="h-3.5 w-48 animate-pulse rounded bg-white/[0.07] motion-reduce:animate-none" />
            <div className="h-3 w-28 animate-pulse rounded bg-white/[0.05] motion-reduce:animate-none" />
          </div>
          <div className="h-5 w-12 animate-pulse rounded-full bg-white/[0.06] motion-reduce:animate-none" />
        </div>
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  )
}
