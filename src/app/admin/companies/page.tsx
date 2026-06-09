'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { proxyFetch } from '@/lib/api'
import { LoadingText } from '@/components/ui/loading-skeleton'
import { EmptyState } from '@/components/ui/empty-state'

type CompanyRow = {
  id: string
  name: string
  partner_id: string | null
  partner_name: string | null
  rep_count: number
}

export default function CompaniesPage() {
  const router = useRouter()
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    proxyFetch('/v1/admin/partner/companies', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (!d?.ok) throw new Error(d?.error || 'Failed to load companies')
        setCompanies(d.companies ?? [])
      })
      .catch((e: any) => setError(e?.message || 'Failed to load companies'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
      {/* Header */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Control Plane</p>
        <h1 className="mt-0.5 text-xl font-semibold text-white">Companies</h1>
        <p className="mt-0.5 text-sm text-neutral-400">Companies visible to your partner scope.</p>
      </div>

      {loading && <LoadingText text="Loading companies…" />}

      {error && !loading && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-4 text-sm text-red-300">
          {error === 'forbidden_not_partner_admin'
            ? 'Access denied — PartnerAdmin or SuperAdmin required.'
            : error}
        </div>
      )}

      {!loading && !error && companies.length === 0 && (
        <EmptyState message="No companies found." sub="No companies are visible within your partner scope." />
      )}

      {!loading && !error && companies.length > 0 && (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800">
                <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Company Name</th>
                <th className="px-4 py-3 text-left text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Partner</th>
                <th className="px-4 py-3 text-right text-[10px] uppercase tracking-[0.12em] text-neutral-500 font-medium">Reps</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/50">
              {companies.map(c => (
                <tr
                  key={c.id}
                  onClick={() => router.push(`/admin/companies/${c.id}`)}
                  className="hover:bg-neutral-900/30 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-white">{c.name}</div>
                    <div className="text-[10px] text-neutral-600 mt-0.5">{c.id.slice(0, 8)}…</div>
                  </td>
                  <td className="px-4 py-3">
                    {c.partner_name ? (
                      <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] text-cyan-300">
                        {c.partner_name}
                      </span>
                    ) : (
                      <span className="text-sm text-neutral-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="tabular-nums text-sm text-neutral-200">{c.rep_count}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="border-t border-neutral-800/60 px-4 py-2 text-[10px] text-neutral-600">
            {companies.length} compan{companies.length !== 1 ? 'ies' : 'y'} · Click to edit
          </div>
        </div>
      )}
    </div>
  )
}
