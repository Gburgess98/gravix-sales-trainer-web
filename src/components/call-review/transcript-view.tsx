import { memo } from 'react'
import { EmptyPanel } from '@/components/ds'
import { clock, transcriptEmptyCopy, type Marker, type Segment } from '@/lib/call-moments-model'

/* Comfortable transcript: one reading column, speaker shown when the speaker changes, a timestamp button per timed
   segment, the segment being played highlighted, and pins / key moments marked where they happened. No nested scroll
   box. Anchors `#transcript-seg-N` keep working (N is the original segment index). */

type Props = {
  segments: Segment[]
  /** Plain-text fallback when the call has text but no timed segments. */
  text: string | null
  activeIndex: number | null
  markers: Record<number, Marker[]>
  /** Seek the recording (when there is one) and bring the segment into view. */
  onSeek: (seconds: number, index: number) => void
  canSeek: boolean
  status: string | null | undefined
}

function Chip({ m }: { m: Marker }) {
  const moment = m.kind === 'moment'
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${
        moment ? 'bg-amber-400/10 text-amber-200 ring-amber-300/20' : 'bg-sky-400/10 text-sky-200 ring-sky-300/20'
      }`}
    >
      <span className="font-medium">{moment ? 'Key moment' : 'Pin'}</span>
      <span className="truncate text-[var(--ds-text-2)]">{m.label}</span>
      <span className="tabular-nums text-[var(--ds-text-3)]">{clock(m.seconds)}</span>
    </span>
  )
}

export const TranscriptView = memo(function TranscriptView({ segments, text, activeIndex, markers, onSeek, canSeek, status }: Props) {
  if (segments.length > 0) {
    return (
      <ol aria-label="Transcript" className="space-y-1">
        {segments.map((seg, i) => {
          const showSpeaker = i === 0 || segments[i - 1].speaker !== seg.speaker
          const active = activeIndex === seg.index
          const rep = /^rep$/i.test(seg.speaker)
          const chips = markers[seg.index]
          return (
            <li
              key={seg.index}
              id={`transcript-seg-${seg.index}`}
              aria-current={active ? 'true' : undefined}
              className={`scroll-mt-24 rounded-lg border-l-2 py-1.5 pl-3 pr-2 [content-visibility:auto] [contain-intrinsic-size:auto_3.5rem] ${
                active ? 'border-[var(--ds-highlight)] bg-white/[0.05]' : 'border-transparent'
              } ${showSpeaker && i !== 0 ? 'mt-3' : ''}`}
            >
              {showSpeaker && (
                <p className={`mb-0.5 text-xs font-semibold ${rep ? 'text-sky-200' : 'text-[var(--ds-text-2)]'}`}>{seg.speaker}</p>
              )}
              <div className="flex items-start gap-3">
                {seg.start !== null ? (
                  canSeek ? (
                    <button
                      type="button"
                      onClick={() => onSeek(seg.start as number, seg.index)}
                      aria-label={`Play from ${clock(seg.start)}`}
                      className="ds-focus mt-0.5 w-12 shrink-0 rounded text-left text-xs tabular-nums text-[var(--ds-text-3)] underline-offset-2 hover:text-[var(--ds-highlight)] hover:underline"
                    >
                      {clock(seg.start)}
                    </button>
                  ) : (
                    <span className="mt-0.5 w-12 shrink-0 text-xs tabular-nums text-[var(--ds-text-3)]">{clock(seg.start)}</span>
                  )
                ) : (
                  <span className="w-12 shrink-0" aria-hidden />
                )}
                <p className="min-w-0 max-w-[68ch] text-[15px] leading-7 text-[var(--ds-text)] [overflow-wrap:anywhere]">{seg.text}</p>
              </div>
              {chips && chips.length > 0 && (
                <div className="ml-[3.75rem] mt-1.5 flex flex-wrap gap-1.5">
                  {chips.map((m, k) => <Chip key={`${m.kind}-${k}`} m={m} />)}
                </div>
              )}
            </li>
          )
        })}
      </ol>
    )
  }
  if (text) {
    return (
      <div>
        <p className="mb-3 text-xs text-[var(--ds-text-3)]">This transcript has no timestamps, so timing and jumping aren’t available.</p>
        <pre className="max-w-[68ch] whitespace-pre-wrap font-sans text-[15px] leading-7 text-[var(--ds-text)] [overflow-wrap:anywhere]">{text}</pre>
      </div>
    )
  }
  const copy = transcriptEmptyCopy(status)
  return <EmptyPanel title={copy.message} body={copy.sub} />
})
