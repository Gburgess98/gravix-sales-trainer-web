import { Badge, EmptyPanel } from '@/components/ds'
import { clock, rankMoments, type Moment } from '@/lib/call-moments-model'

/* Key moments: the few points in the call that matter most, most important first, each tied to its timestamp.
   Moments come from scoring (`analysis_json.moments`); this component never invents one. Selecting a moment jumps the
   recording AND the transcript to that point (the page owns what "jump" does). */

const TONE = { high: 'bad', medium: 'warn', low: 'neutral' } as const
const TOP = 5

function Row({ m, onJump, canJump }: { m: Moment; onJump: (m: Moment) => void; canJump: boolean }) {
  return (
    <li className="flex gap-3 px-5 py-3.5 sm:px-6">
      {m.seconds !== null && canJump ? (
        <button
          type="button"
          onClick={() => onJump(m)}
          aria-label={`Go to ${clock(m.seconds)}: ${m.label}`}
          className="ds-focus h-8 shrink-0 rounded-md border border-[var(--ds-border-strong)] bg-white/[0.04] px-2.5 text-sm tabular-nums text-[var(--ds-highlight)] hover:bg-white/[0.08] motion-reduce:transition-none"
        >
          {clock(m.seconds)}
        </button>
      ) : (
        <span className="inline-flex h-8 shrink-0 items-center px-2.5 text-sm tabular-nums text-[var(--ds-text-3)]" title="No timestamp for this moment">
          {clock(m.seconds)}
        </span>
      )}
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-[var(--ds-text)]">
          {m.label}
          <Badge tone={TONE[m.severity]}>{m.severity === 'high' ? 'High impact' : m.severity === 'low' ? 'Low impact' : 'Medium impact'}</Badge>
        </p>
        <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-[var(--ds-text-2)] [overflow-wrap:anywhere]">{m.text}</p>
      </div>
    </li>
  )
}

export function KeyMoments({ moments, onJump, canJump }: { moments: Moment[]; onJump: (m: Moment) => void; canJump: boolean }) {
  if (moments.length === 0) {
    return (
      <EmptyPanel
        title="No key moments were detected for this call."
        body="Moments are detected when a call is scored. Calls still processing, or with nothing flagged, show none."
      />
    )
  }
  const { top, rest } = rankMoments(moments, TOP)
  return (
    <div>
      <p className="px-5 pt-4 text-xs text-[var(--ds-text-3)] sm:px-6">
        Detected by scoring · most important first{canJump ? ' · select a time to jump there' : ''}
      </p>
      <ol aria-label="Key moments" className="mt-2 divide-y divide-[var(--ds-border)]">
        {top.map((m) => <Row key={m.key} m={m} onJump={onJump} canJump={canJump} />)}
      </ol>
      {rest.length > 0 && (
        <details className="group border-t border-[var(--ds-border)]">
          <summary className="ds-focus flex cursor-pointer list-none items-center gap-2 px-5 py-3 text-sm text-[var(--ds-text-2)] hover:text-[var(--ds-text)] sm:px-6 [&::-webkit-details-marker]:hidden">
            Show {rest.length} more {rest.length === 1 ? 'moment' : 'moments'}
            <span aria-hidden className="text-[var(--ds-text-3)] transition-transform group-open:rotate-180 motion-reduce:transition-none">▾</span>
          </summary>
          <ol aria-label="More key moments" className="divide-y divide-[var(--ds-border)] border-t border-[var(--ds-border)]">
            {rest.map((m) => <Row key={m.key} m={m} onJump={onJump} canJump={canJump} />)}
          </ol>
        </details>
      )}
    </div>
  )
}
