'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { proxyFetch } from '@/lib/api'
import { LoadingText } from '@/components/ui/loading-skeleton'

type CompanyDetail = {
  id: string
  name: string
  slug: string | null
  website: string | null
  industry: string | null
  phone: string | null
  address: string | null
  active: boolean
  partner_id: string | null
  partner_name: string | null
  created_at: string | null
  updated_at: string | null
}

export default function CompanyEditorPage() {
  const { id } = useParams<{ id: string }>() ?? { id: "" }

  const [company, setCompany] = useState<CompanyDetail | null>(null)
  const [userCount, setUserCount] = useState(0)
  const [actorTier, setActorTier] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [name, setName] = useState('')
  const [website, setWebsite] = useState('')
  const [industry, setIndustry] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [active, setActive] = useState(true)

  useEffect(() => {
    if (!id) return
    proxyFetch(`/v1/admin/companies/${id}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (!d?.ok) throw new Error(d?.error || 'Failed to load company')
        const c = d.company as CompanyDetail
        setCompany(c)
        setActorTier(d.actor_tier ?? null)
        setUserCount(d.user_count ?? 0)
        setName(c.name ?? '')
        setWebsite(c.website ?? '')
        setIndustry(c.industry ?? '')
        setPhone(c.phone ?? '')
        setAddress(c.address ?? '')
        setActive(c.active ?? true)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Company name is required'); return }
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const r = await proxyFetch(`/v1/admin/companies/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, website, industry, phone, address, active }),
      })
      const d = await r.json()
      if (!d?.ok) throw new Error(d?.error || 'Save failed')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (e: any) {
      setError(e?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="mx-auto max-w-2xl px-6 py-8"><LoadingText text="Loading company…" /></div>
  )

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
      <Link href="/admin/companies" className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors">
        <ChevronLeft size={12} />
        Back to Companies
      </Link>

      <div>
        <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Control Plane</p>
        <h1 className="mt-0.5 text-xl font-semibold text-white">{company?.name ?? 'Company'}</h1>
        <p className="mt-0.5 text-sm text-neutral-400">
          {company?.partner_name ? `Partner: ${company.partner_name}` : 'No partner'} · {userCount} users
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">{error}</div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">Company saved.</div>
      )}

      <form onSubmit={handleSave} className="flex flex-col gap-5">
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 px-5 py-4 flex flex-col gap-4">
          <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Details</p>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5 col-span-2">
              <label className="text-xs text-neutral-400">Company Name <span className="text-red-400">*</span></label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={120}
                required
                className="rounded-xl border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/40"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-neutral-400">Website</label>
              <input
                type="url"
                value={website}
                onChange={e => setWebsite(e.target.value)}
                maxLength={200}
                className="rounded-xl border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/40"
                placeholder="https://example.com"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-neutral-400">Industry</label>
              <input
                type="text"
                value={industry}
                onChange={e => setIndustry(e.target.value)}
                maxLength={100}
                className="rounded-xl border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/40"
                placeholder="Sales Technology"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-neutral-400">Phone</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                maxLength={30}
                className="rounded-xl border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/40"
                placeholder="+44 20 7946 0000"
              />
            </div>

            <div className="flex flex-col gap-1.5 col-span-2">
              <label className="text-xs text-neutral-400">Address</label>
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                maxLength={300}
                className="rounded-xl border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/40"
                placeholder="123 Main St, London EC1A 1BB"
              />
            </div>
          </div>

          {actorTier === 'SuperAdmin' && (
            <div className="flex items-center gap-3">
              <label className="text-xs text-neutral-400">Active</label>
              <button
                type="button"
                onClick={() => setActive(v => !v)}
                className={`relative h-5 w-9 rounded-full transition-colors ${active ? 'bg-emerald-500' : 'bg-neutral-700'}`}
              >
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${active ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </button>
              <span className="text-xs text-neutral-500">{active ? 'Active' : 'Inactive'}</span>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-5 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save Company'}
          </button>
        </div>
      </form>
    </div>
  )
}
