'use client'

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { dsButton } from '@/components/ds'

/* Confirmation for organisation-wide or hard-to-undo changes. Uses the native <dialog> (showModal): the browser
   traps focus, makes the rest of the page inert, closes on Escape and returns focus to the control that opened it. */
export function ConfirmDialog({
  open, title, children, confirmLabel, cancelLabel = 'Cancel', busy = false, onConfirm, onCancel,
}: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  cancelLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId() // one dialog per instance: ids must be unique or the accessible name resolves to the wrong title

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); if (!busy) onCancel() }}
      className="m-auto w-[min(92vw,28rem)] rounded-[var(--ds-radius-card,16px)] border border-[var(--ds-border-strong)] bg-[#0d1422] p-0 text-[var(--ds-text)] shadow-2xl backdrop:bg-black/60"
    >
      <div className="p-5 sm:p-6">
        <h2 id={titleId} className="text-base font-semibold">{title}</h2>
        <div className="mt-2 space-y-2 text-sm text-[var(--ds-text-2)]">{children}</div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className={dsButton('quiet', 'md')}>{cancelLabel}</button>
          <button type="button" onClick={onConfirm} disabled={busy} className={dsButton('primary', 'md')} autoFocus>{busy ? 'Saving…' : confirmLabel}</button>
        </div>
      </div>
    </dialog>
  )
}
