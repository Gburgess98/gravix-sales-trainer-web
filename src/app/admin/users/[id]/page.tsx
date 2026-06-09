'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { proxyFetch } from '@/lib/api'
import { LoadingText } from '@/components/ui/loading-skeleton'

type UserDetail = {
  id: string
  name: string
  display_name: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  job_title: string | null
  department: string | null
  manager_id: string | null
  manager_name: string | null
  timezone: string | null
  active: boolean
  tier: string | null
  company_id: string | null
  company_name: string | null
  avatar_url: string | null
  xp: number
  created_at: string | null
  updated_at: string | null
}

type PossibleManager = { id: string; name: string }

const TIERS = ['SalesRep', 'TeamLead', 'Manager', 'Owner', 'PartnerAdmin', 'SuperAdmin']
const TIMEZONES = [
  'UTC', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney',
]

export default function UserEditorPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [user, setUser] = useState<UserDetail | null>(null)
  const [possibleManagers, setPossibleManagers] = useState<PossibleManager[]>([])
  const [actorTier, setActorTier] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Editable form state
  const [phone, setPhone] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [department, setDepartment] = useState('')
  const [managerId, setManagerId] = useState('')
  const [active, setActive] = useState(true)
  const [tier, setTier] = useState('')

  useEffect(() => {
    if (!id) return
    proxyFetch(`/v1/admin/users/${id}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (!d?.ok) throw new Error(d?.error || 'Failed to load user')
        const u = d.user as UserDetail
        setUser(u)
        setActorTier(d.actor_tier ?? null)
        setPossibleManagers(d.possible_managers ?? [])
        setPhone(u.phone ?? '')
        setJobTitle(u.job_title ?? '')
        setDepartment(u.department ?? '')
        setManagerId(u.manager_id ?? '')
        setActive(u.active ?? true)
        setTier(u.tier ?? 'SalesRep')
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!phone.trim()) { setError('Phone number is required'); return }
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const body: Record<string, any> = {
        phone,
        job_title: jobTitle,
        department,
        manager_id: managerId || null,
        active,
      }
      if (actorTier === 'SuperAdmin') body.tier = tier
      const r = await proxyFetch(`/v1/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
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
    <div className="mx-auto max-w-2xl px-6 py-8"><LoadingText text="Loading user…" /></div>
  )
  if (!user && error) return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <p className="text-sm text-red-300">{error}</p>
    </div>
  )
  if (!user) return null

  const canEditTier = actorTier === 'SuperAdmin'

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-6">
      {/* Back */}
      <Link href="/admin/users" className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors">
        <ChevronLeft size={12} />
        Back to Users
      </Link>

      <div>
        <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Control Plane</p>
        <h1 className="mt-0.5 text-xl font-semibold text-white">{user.display_name ?? user.name}</h1>
        <p className="mt-0.5 text-sm text-neutral-400">{user.email ?? user.id}</p>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">{error}</div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">User saved.</div>
      )}

      <form onSubmit={handleSave} className="flex flex-col gap-5">
        {/* Read-only info */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 px-5 py-4 flex flex-col gap-3">
          <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Account Info</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-neutral-500 text-xs mb-0.5">Email</p>
              <p className="text-white">{user.email ?? '—'}</p>
            </div>
            <div>
              <p className="text-neutral-500 text-xs mb-0.5">Company</p>
              <p className="text-white">{user.company_name ?? '—'}</p>
            </div>
            <div>
              <p className="text-neutral-500 text-xs mb-0.5">XP</p>
              <p className="text-white">{user.xp}</p>
            </div>
            <div>
              <p className="text-neutral-500 text-xs mb-0.5">Joined</p>
              <p className="text-white">{user.created_at ? new Date(user.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</p>
            </div>
          </div>
        </div>

        {/* Editable fields */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 px-5 py-4 flex flex-col gap-4">
          <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Edit</p>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-neutral-400">Phone <span className="text-red-400">*</span></label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                maxLength={30}
                required
                className="rounded-xl border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/40"
                placeholder="+44 7700 900000"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-neutral-400">Job Title</label>
              <input
                type="text"
                value={jobTitle}
                onChange={e => setJobTitle(e.target.value)}
                maxLength={100}
                className="rounded-xl border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/40"
                placeholder="Sales Executive"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-neutral-400">Department</label>
              <input
                type="text"
                value={department}
                onChange={e => setDepartment(e.target.value)}
                maxLength={100}
                className="rounded-xl border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/40"
                placeholder="Sales"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-neutral-400">Manager</label>
              <select
                value={managerId}
                onChange={e => setManagerId(e.target.value)}
                className="rounded-xl border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/40"
              >
                <option value="">— None —</option>
                {possibleManagers.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            {canEditTier && (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-neutral-400">Tier</label>
                <select
                  value={tier}
                  onChange={e => setTier(e.target.value)}
                  className="rounded-xl border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-cyan-500/40"
                >
                  {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}
          </div>

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
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-5 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save User'}
          </button>
        </div>
      </form>
    </div>
  )
}
