'use client'

import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { proxyFetch } from '@/lib/api'

export type EntityHit = { id: string; label: string; sublabel?: string }
export type EntityType = 'account' | 'contact' | 'rep'

export interface EntitySearchProps {
  type: EntityType
  value: EntityHit | null
  onChange: (hit: EntityHit | null) => void
  placeholder?: string
  disabled?: boolean
  className?: string
}

const PLACEHOLDER: Record<EntityType, string> = {
  account: 'Search accounts…',
  contact: 'Search contacts…',
  rep: 'Search reps and managers…',
}

// ── Fetch helpers per entity type ─────────────────────────────────────────────

async function fetchHits(type: EntityType, query: string): Promise<EntityHit[]> {
  const q = query.trim().toLowerCase()

  if (type === 'contact') {
    const res = await proxyFetch(`/v1/crm/contacts?query=${encodeURIComponent(query)}&limit=8`, { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    return (data.items ?? []).map((c: any) => ({
      id: String(c.id),
      label: c.name ?? c.email ?? c.id,
      sublabel: [c.email, c.company].filter(Boolean).join(' · ') || undefined,
    }))
  }

  if (type === 'account') {
    const res = await proxyFetch(`/v1/accounts?q=${encodeURIComponent(query)}&limit=8`, { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    const accounts: any[] = data.accounts ?? []
    const hits = q
      ? accounts.filter(a =>
          String(a.name ?? '').toLowerCase().includes(q) ||
          String(a.domain ?? '').toLowerCase().includes(q)
        )
      : accounts
    return hits.slice(0, 8).map(a => ({
      id: String(a.id),
      label: a.name ?? a.id,
      sublabel: a.domain ?? undefined,
    }))
  }

  if (type === 'rep') {
    const res = await proxyFetch('/v1/admin/reps', { cache: 'no-store' })
    const data = await res.json().catch(() => ({}))
    const reps: any[] = data.reps ?? []
    const hits = q
      ? reps.filter(r => String(r.name ?? '').toLowerCase().includes(q))
      : reps
    return hits.slice(0, 8).map(r => ({
      id: String(r.id),
      label: r.name ?? r.id,
      sublabel: r.tier ?? undefined,
    }))
  }

  return []
}

// ── Component ─────────────────────────────────────────────────────────────────

type DropdownRect = { top: number; left: number; width: number }

export function EntitySearch({
  type,
  value,
  onChange,
  placeholder,
  disabled,
  className = '',
}: EntitySearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<EntityHit[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const [dropdownRect, setDropdownRect] = useState<DropdownRect | null>(null)
  // Portal requires the DOM — avoid SSR mismatch
  const [mounted, setMounted] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => { setMounted(true) }, [])

  // Compute the dropdown's fixed position from the input's viewport rect
  function measureRect() {
    if (!inputRef.current) return
    const r = inputRef.current.getBoundingClientRect()
    setDropdownRect({ top: r.bottom + 4, left: r.left, width: r.width })
  }

  // Close on outside click — must exclude both the anchor and the portal dropdown
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const target = e.target as Node
      if (
        containerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // Update dropdown position while open so it tracks the input on scroll/resize
  useEffect(() => {
    if (!open) return
    measureRect()
    // Capture phase catches scroll inside any ancestor container
    window.addEventListener('scroll', measureRect, true)
    window.addEventListener('resize', measureRect)
    return () => {
      window.removeEventListener('scroll', measureRect, true)
      window.removeEventListener('resize', measureRect)
    }
  }, [open])

  // Search effect — debounced for contact/account, immediate load for rep
  useEffect(() => {
    if (!open) return

    if (type === 'rep') {
      setLoading(true)
      fetchHits('rep', query)
        .then(hits => { setResults(hits); setHighlightIdx(0) })
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
      return
    }

    if (!query.trim()) {
      setResults([])
      setLoading(false)
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const hits = await fetchHits(type, query)
        setResults(hits)
        setHighlightIdx(0)
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 250)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open, type])

  function select(hit: EntityHit) {
    onChange(hit)
    setOpen(false)
    setQuery('')
    setResults([])
  }

  function clear() {
    onChange(null)
    setQuery('')
    setResults([])
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') setOpen(true)
      return
    }
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, results.length - 1)); return }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)); return }
    if (e.key === 'Enter' && results[highlightIdx]) {
      e.preventDefault()
      select(results[highlightIdx])
    }
  }

  // ── Portal dropdown ───────────────────────────────────────────────────────
  const dropdownContent = open && dropdownRect ? (
    <div
      ref={dropdownRef}
      style={{
        position: 'fixed',
        top: dropdownRect.top,
        left: dropdownRect.left,
        width: dropdownRect.width,
        zIndex: 9999,
        minWidth: 200,
      }}
      className="rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl overflow-hidden"
    >
      {loading && (
        <div className="px-3 py-2.5 text-xs text-neutral-500">Searching…</div>
      )}
      {!loading && results.length === 0 && !query.trim() && type !== 'rep' && (
        <div className="px-3 py-2.5 text-xs text-neutral-500">
          Type to search {type === 'account' ? 'accounts' : 'contacts'}…
        </div>
      )}
      {!loading && results.length === 0 && query.trim() && (
        <div className="px-3 py-2.5 text-xs text-neutral-500">
          No {type === 'rep' ? 'reps' : type === 'account' ? 'accounts' : 'contacts'} found for &quot;{query}&quot;
        </div>
      )}
      {!loading && results.map((hit, i) => (
        <button
          key={hit.id}
          type="button"
          onMouseDown={e => { e.preventDefault(); select(hit) }}
          className={`flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors ${
            i === highlightIdx
              ? 'bg-neutral-800 text-white'
              : 'text-neutral-300 hover:bg-neutral-800/60'
          }`}
        >
          <div className="flex-1 min-w-0">
            <div className="text-sm truncate">{hit.label}</div>
            {hit.sublabel && (
              <div className="text-[10px] text-neutral-500 truncate mt-0.5">{hit.sublabel}</div>
            )}
          </div>
        </button>
      ))}
    </div>
  ) : null

  // ── Selected state ────────────────────────────────────────────────────────
  if (value) {
    return (
      <div className={`flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 py-2 ${className}`}>
        <div className="flex-1 min-w-0">
          <span className="text-sm text-white">{value.label}</span>
          {value.sublabel && (
            <span className="ml-2 text-[11px] text-neutral-500">{value.sublabel}</span>
          )}
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={clear}
            className="shrink-0 rounded p-0.5 text-neutral-500 hover:text-neutral-300 transition-colors text-xs leading-none"
            aria-label="Clear selection"
          >
            ✕
          </button>
        )}
      </div>
    )
  }

  // ── Search input ──────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        disabled={disabled}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? PLACEHOLDER[type]}
        autoComplete="off"
        className="w-full rounded-lg border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/40 placeholder:text-neutral-600 disabled:opacity-50"
      />
      {mounted && dropdownContent && createPortal(dropdownContent, document.body)}
    </div>
  )
}
