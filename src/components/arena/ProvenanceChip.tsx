import { clsx } from 'clsx'
import type { Provenance } from '@/lib/sparring-arena'

// Text + colour (never colour alone). Anything that is not plainly real is labelled where it appears.
const META: Record<Provenance, { label: string; cls: string; title: string }> = {
  real: { label: 'Live', cls: 'border-cyan-400/40 text-cyan-100', title: 'Read directly from the platform.' },
  derived: {
    label: 'Derived',
    cls: 'border-cyan-400/40 text-cyan-100',
    title: 'Calculated from real sessions the API returned (latest 50).',
  },
  unavailable: {
    label: 'Not available',
    cls: 'border-slate-500/60 text-slate-300',
    title: 'The current API cannot provide this for your role. Nothing is estimated.',
  },
  placeholder: {
    label: 'Placeholder',
    cls: 'border-violet-400/50 text-violet-200',
    title: 'Temporary presentation copy. There is no API field for it yet.',
  },
  demo: {
    label: 'DEMO',
    cls: 'border-amber-400/70 bg-amber-400/10 text-amber-200',
    title: 'Sample number for design review. Not a real result.',
  },
}

export function ProvenanceChip({ kind, className }: { kind: Provenance; className?: string }) {
  const m = META[kind]
  return (
    <span
      title={m.title}
      className={clsx(
        'inline-flex items-center rounded-full border px-1.5 py-px text-[10px] font-semibold uppercase tracking-wider',
        m.cls,
        className,
      )}
    >
      {m.label}
    </span>
  )
}
