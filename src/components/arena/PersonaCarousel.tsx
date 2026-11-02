'use client'

// Looping cover-flow carousel. CSS transforms only (translate3d / rotateY / scale / opacity); no 3D library.
// - NEVER advances on its own: only drag/swipe, wheel, arrow buttons, keyboard or a tap/click on a card move it.
// - `3d` layout on wide screens; `strip` layout (plain horizontal scroll-snap row) for mobile / weak devices.
// - ARIA carousel pattern: group + aria-roledescription, per-slide labels, polite live region for the selection.

import { useCallback, useEffect, useRef } from 'react'
import { clsx } from 'clsx'
import styles from './arena.module.css'
import { PersonaGlyph } from './PersonaGlyph'
import {
  DIFFICULTY_META,
  loopOffset,
  normaliseDifficulty,
  presentationFor,
  stepIndex,
  type ApiPersona,
} from '@/lib/sparring-arena'

export type CarouselLayout = '3d' | 'strip'

interface Props {
  personas: ApiPersona[]
  active: number
  onActiveChange: (index: number) => void
  /** Enter / Space on the focused carousel, or the Challenge button's own handler. */
  onChallenge: () => void
  layout: CarouselLayout
  labelId: string
}

const DRAG_STEP = 110 // px of horizontal drag per card
const FLICK_MIN = 40 // a short flick still moves one card
const WHEEL_LOCK_MS = 420

export function DifficultyPips({ difficulty }: { difficulty: string | null | undefined }) {
  const d = DIFFICULTY_META[normaliseDifficulty(difficulty)]
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={clsx(styles.pip, n <= d.level && styles.pipOn)} />
        ))}
      </span>
      <span className="text-xs font-medium text-cyan-100">{d.label}</span>
    </span>
  )
}

function CardFace({ persona, selected }: { persona: ApiPersona; selected: boolean }) {
  const p = presentationFor(persona)
  return (
    <div className={clsx(styles.panel, selected && styles.glowActive)}>
      <PersonaGlyph id={persona.id} size={selected ? 132 : 104} />
      <div className="mt-3 text-center">
        <div className="text-base font-semibold tracking-tight text-white">{persona.label}</div>
        <div className="mt-0.5 text-xs text-cyan-100/90">{p.role}</div>
        <div className="mt-2.5 flex justify-center">
          <DifficultyPips difficulty={persona.difficulty_default} />
        </div>
        {selected && persona.traits && persona.traits.length > 0 && (
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            {persona.traits.slice(0, 2).map((t) => (
              <span key={t} className="rounded-full border border-cyan-400/30 px-2 py-0.5 text-[11px] text-cyan-50">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function PersonaCarousel({ personas, active, onActiveChange, onChallenge, layout, labelId }: Props) {
  const n = personas.length
  const stageRef = useRef<HTMLDivElement | null>(null)
  const drag = useRef<{ x: number; startX: number; id: number; moved: boolean; stepped: boolean } | null>(null)
  const wheelLock = useRef(0)
  const justDragged = useRef(false)

  // Step from a ref that is updated synchronously, so several steps inside one event tick compound correctly.
  const activeRef = useRef(active)
  useEffect(() => {
    activeRef.current = active
  }, [active])
  const go = useCallback(
    (delta: number) => {
      const next = stepIndex(activeRef.current, delta, n)
      activeRef.current = next
      onActiveChange(next)
    },
    [n, onActiveChange],
  )

  // Wheel: native non-passive listener so a handled step can preventDefault (React's onWheel is passive).
  useEffect(() => {
    const el = stageRef.current
    if (!el || layout !== '3d') return
    const onWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (Math.abs(delta) < 6) return
      e.preventDefault()
      const now = Date.now()
      if (now - wheelLock.current < WHEEL_LOCK_MS) return
      wheelLock.current = now
      go(delta > 0 ? 1 : -1)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [go, layout])

  // Strip layout: keep the selected card in view (instant when motion is reduced).
  useEffect(() => {
    if (layout !== 'strip') return
    const el = stageRef.current?.querySelector<HTMLElement>('[data-active="true"]')
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
  }, [active, layout])

  function onKeyDown(e: React.KeyboardEvent) {
    const act = (fn: () => void) => {
      e.preventDefault()
      fn()
    }
    if (e.key === 'ArrowRight') act(() => go(1))
    else if (e.key === 'ArrowLeft') act(() => go(-1))
    else if (e.key === 'Home') act(() => onActiveChange(0))
    else if (e.key === 'End') act(() => onActiveChange(n - 1))
    else if (e.key === 'Enter' || e.key === ' ') act(onChallenge)
  }

  function onPointerDown(e: React.PointerEvent) {
    if (layout !== '3d' || e.button > 0) return
    drag.current = { x: e.clientX, startX: e.clientX, id: e.pointerId, moved: false, stepped: false }
    justDragged.current = false
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = drag.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.x
    if (!d.moved && Math.abs(e.clientX - d.startX) > 6) {
      d.moved = true
      ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    }
    const steps = Math.trunc(Math.abs(dx) / DRAG_STEP)
    if (steps > 0) {
      const dir = dx < 0 ? 1 : -1
      go(dir * steps) // one call, so the loop index is computed once from the current selection
      d.x += (dx < 0 ? -1 : 1) * steps * DRAG_STEP
      d.stepped = true
      justDragged.current = true
    }
  }
  function onPointerEnd(e: React.PointerEvent) {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.moved) justDragged.current = true
    const total = e.clientX - d.startX
    if (d.moved && !d.stepped && Math.abs(total) >= FLICK_MIN) go(total < 0 ? 1 : -1)
    // swallow the click that follows a drag
    window.setTimeout(() => (justDragged.current = false), 0)
  }
  function selectCard(i: number) {
    if (justDragged.current) return
    onActiveChange(i)
  }

  const activePersona = personas[active]
  const announce = activePersona
    ? `${activePersona.label}, ${presentationFor(activePersona).role}. ${DIFFICULTY_META[normaliseDifficulty(activePersona.difficulty_default)].label} difficulty. ${active + 1} of ${n}.`
    : ''

  return (
    <div className="relative">
      <div
        ref={stageRef}
        role="group"
        aria-roledescription="carousel"
        aria-labelledby={labelId}
        aria-describedby={`${labelId}-help`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        className={layout === '3d' ? styles.stage : styles.strip}
      >
        {personas.map((persona, i) => {
          const off = loopOffset(i, active, n)
          const abs = Math.abs(off)
          const selected = i === active
          const common = {
            role: 'group' as const,
            'aria-roledescription': 'slide',
            'aria-label': `${persona.label}, ${i + 1} of ${n}`,
            'aria-current': selected ? ('true' as const) : undefined,
            'data-active': selected ? 'true' : 'false',
            onClick: () => selectCard(i),
          }
          if (layout === 'strip') {
            return (
              <div key={persona.id} {...common} className={styles.stripCard}>
                <CardFace persona={persona} selected={selected} />
              </div>
            )
          }
          return (
            <div
              key={persona.id}
              {...common}
              className={clsx(styles.card, abs > 2 && styles.cardHidden)}
              style={{ ['--off' as string]: off, ['--abs' as string]: Math.min(abs, 3), zIndex: 10 - abs }}
            >
              <div className={clsx(selected && styles.float)}>
                <CardFace persona={persona} selected={selected} />
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-1 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="Previous opponent"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-cyan-400/40 bg-[#0a1226] text-cyan-100 transition-colors hover:border-cyan-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <span className="min-w-[5rem] text-center text-xs tabular-nums text-cyan-100/90" aria-hidden="true">
          {active + 1} / {n}
        </span>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="Next opponent"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-cyan-400/40 bg-[#0a1226] text-cyan-100 transition-colors hover:border-cyan-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>

      <p id={`${labelId}-help`} className="sr-only">
        Use the left and right arrow keys, Home and End to choose an opponent, and Enter to challenge them.
      </p>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </div>
    </div>
  )
}
