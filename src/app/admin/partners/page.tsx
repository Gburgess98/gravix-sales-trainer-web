'use client'

import { useEffect, useState } from 'react'
import { proxyFetch } from '@/lib/api'
import { LoadingText } from '@/components/ui/loading-skeleton'
import { EmptyState } from '@/components/ui/empty-state'

type PartnerRow = {
  id: string
  name: string
  status: string
  company_count: number
  created_at: string | null
}

function fmtDate(v: string | null) {
  if (!v) return '—'
  return new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function PartnersPage() {
  const [partners, setPartners] = useState<PartnerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    proxyFetch('/v1/admin/super/partners', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (!d?.ok) throw new Error(d?.error || 'Failed to load partners')
        setPartners(d.partners ?? [])
      })
      .catch((e: any) => setError(e?.message || 'Failed to load partners'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
      {/* Header */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Control Plane</p>
        <h1 className="mt-0.5 text-xl font-semibold text-white">Partners</h1>
        <p className="mt-0.5 text-sm text-neutral-400">All partner organisations. SuperAdmin view only.</p>
      </div>

      {loading && <LoadingText text="Loading partners…" />}

      {error && !loading && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-4 text-sm text-red-300">
          {error === 'forbidden_not_super_admin'
            ? 'Access denied — SuperAdmin only.'
            : error}
        </div>
      )}

      {!loading && !error && partners.length === 0 && (
        <EmptyState message="No partners found." sub="No partner organisations have been created yet." />
      )}

      {!loading && !error && partners.length > 0 && (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800">
                <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Partner Name</th>
                <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Status</th>
                <th className="px-4 py-3 text-right text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Companies</th>
                <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/50">
              {partners.map(p => (
                <tr key={p.id} className="hover:bg-neutral-900/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-white">{p.name}</div>
                    <div className="text-[10px] text-neutral-600 mt-0.5">{p.id.slice(0, 8)}…</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide font-medium ${
                      p.status === 'active'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        : 'border-neutral-700 bg-neutral-900 text-neutral-400'
                    }`}>
                      {p.status || 'active'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="tabular-nums text-sm text-neutral-200">{p.company_count}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-neutral-400">{fmtDate(p.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-neutral-800/60 px-4 py-2 text-[10px] text-neutral-600">
            {partners.length} partner{partners.length !== 1 ? 's' : ''} · Read only
          </div>
        </div>
      )}
    </div>
  )
}
