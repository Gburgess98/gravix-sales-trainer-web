'use client'

import { useEffect, useState } from 'react'
import { proxyFetch } from '@/lib/api'
import { LoadingText } from '@/components/ui/loading-skeleton'
import { PageContainer } from '@/components/layout/page-container'
import { PageHeader } from '@/components/layout/page-header'

type Profile = {
  id: string
  display_name: string | null
  email: string | null
  phone: string | null
  timezone: string | null
  tier: string | null
  company_name: string | null
  job_title: string | null
}

const TIMEZONES = [
  'UTC', 'Europe/London', 'Europe/Paris', 'Europe/Berlin',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney',
]

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [timezone, setTimezone] = useState('UTC')

  useEffect(() => {
    proxyFetch('/v1/users/me', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (!d?.ok) throw new Error(d?.error || 'Failed to load profile')
        const u = d.user as Profile
        setProfile(u)
        setDisplayName(u.display_name ?? '')
        setPhone(u.phone ?? '')
        setTimezone(u.timezone ?? 'UTC')
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!phone.trim()) { setError('Phone number is required'); return }
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const r = await proxyFetch('/v1/users/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ display_name: displayName, phone, timezone }),
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
    <PageContainer className="mx-auto max-w-2xl"><LoadingText text="Loading profile…" /></PageContainer>
  )

  return (
    <PageContainer className="mx-auto w-full max-w-2xl">
      <PageHeader
        title="My Profile"
        subtitle="Update your display name, phone number and timezone."
      />

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">{error}</div>
      )}
      {success && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">Profile saved.</div>
      )}

      <form onSubmit={handleSave} className="flex flex-col gap-5">
        {/* Read-only info */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 px-5 py-4 flex flex-col gap-3">
          <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Account</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-neutral-500 text-xs mb-0.5">Email</p>
              <p className="text-white">{profile?.email ?? '—'}</p>
            </div>
            <div>
              <p className="text-neutral-500 text-xs mb-0.5">Tier</p>
              <p className="text-white">{profile?.tier ?? '—'}</p>
            </div>
            <div>
              <p className="text-neutral-500 text-xs mb-0.5">Company</p>
              <p className="text-white">{profile?.company_name ?? '—'}</p>
            </div>
            <div>
              <p className="text-neutral-500 text-xs mb-0.5">Job Title</p>
              <p className="text-white">{profile?.job_title ?? '—'}</p>
            </div>
          </div>
        </div>

        {/* Editable fields */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 px-5 py-4 flex flex-col gap-4">
          <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Editable</p>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-neutral-400">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              maxLength={120}
              className="rounded-xl border border-neutral-800 bg-black/40 px-4 py-2 text-sm text-white outline-none focus:border-indigo-500/40 placeholder:text-neutral-600"
              placeholder="Your display name"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-neutral-400">
              Phone Number <span className="text-red-400">*</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              maxLength={30}
              required
              className="rounded-xl border border-neutral-800 bg-black/40 px-4 py-2 text-sm text-white outline-none focus:border-indigo-500/40 placeholder:text-neutral-600"
              placeholder="+44 7700 900000"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-neutral-400">Timezone</label>
            <select
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              className="rounded-xl border border-neutral-800 bg-black/40 px-4 py-2 text-sm text-white outline-none focus:border-indigo-500/40"
            >
              {TIMEZONES.map(tz => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl border border-indigo-500/20 bg-indigo-600/20 px-5 py-2 text-sm font-medium text-indigo-200 hover:bg-indigo-600/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </form>
    </PageContainer>
  )
}
