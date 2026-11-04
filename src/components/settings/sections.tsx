'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Badge, ErrorPanel, GlassCard, LoadingRows, Panel, PanelHeader, dsButton, dsField } from '@/components/ds'
import { proxyFetch } from '@/lib/api'
import {
  VISIBILITY_OPTIONS,
  roleCounts,
  seatsText,
  summariseVersion,
  type CallVisibility,
  type GamificationForm,
  type Seats,
  type ThresholdForm,
} from '@/lib/settings-model'

/* Settings sections. Only controls that are backed by an existing, working endpoint are editable; everything
   else is read-only or a link to the screen that already owns it. Errors are calm and never show raw API text. */

export type Notice = { type: 'success' | 'error'; text: string } | null

/* ── shared bits ───────────────────────────────────────────── */

function SectionPanel({ title, description, meta, children }: { title: string; description?: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <Panel>
      <PanelHeader title={title} meta={meta} />
      {description && <p className="px-5 pt-4 text-sm text-[var(--ds-text-2)] sm:px-6">{description}</p>}
      {children}
    </Panel>
  )
}

function StatusLine({ notice }: { notice: Notice }) {
  return (
    <div role="status" aria-live="polite" className={notice ? 'px-5 pb-1 text-sm sm:px-6' : 'sr-only'}>
      {notice && <p className={notice.type === 'success' ? 'text-emerald-200' : 'text-red-200'}>{notice.text}</p>}
    </div>
  )
}

function SaveBar({ dirty, saving, disabled, onSave, onDiscard, saveLabel = 'Save changes' }: { dirty: boolean; saving: boolean; disabled?: boolean; onSave: () => void; onDiscard: () => void; saveLabel?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-[var(--ds-border)] px-5 py-4 sm:px-6">
      <button type="button" onClick={onSave} disabled={!dirty || saving || disabled} className={dsButton('primary', 'md')}>{saving ? 'Saving…' : saveLabel}</button>
      <button type="button" onClick={onDiscard} disabled={!dirty || saving} className={dsButton('quiet', 'md')}>Discard changes</button>
      {dirty && !saving && <span className="text-xs text-amber-200">Unsaved changes</span>}
    </div>
  )
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-[var(--ds-text)]">{label}</label>
      <div className="mt-1.5 max-w-xs">{children}</div>
      <p id={`${id}-hint`} className="mt-1.5 text-xs text-[var(--ds-text-3)]">{hint}</p>
      {error && <p id={`${id}-error`} className="mt-1 text-xs text-red-200">{error}</p>}
    </div>
  )
}

type Fetched<T> = { state: 'loading' } | { state: 'ok'; data: T } | { state: 'denied' } | { state: 'error' }

/** GET through proxyFetch; 401/403 is "denied" (not an error), anything else non-OK or thrown is "error". */
function useFetched<T>(path: string, pick: (json: any) => T | null): { result: Fetched<T>; reload: () => void } {
  const [result, setResult] = useState<Fetched<T>>({ state: 'loading' })
  const [n, setN] = useState(0)
  useEffect(() => {
    let alive = true
    setResult({ state: 'loading' })
    ;(async () => {
      try {
        const res = await proxyFetch(path, { cache: 'no-store' })
        if (res.status === 401 || res.status === 403) return alive && setResult({ state: 'denied' })
        const json = await res.json().catch(() => null)
        const data = res.ok && json?.ok !== false ? pick(json) : null
        if (alive) setResult(data === null ? { state: 'error' } : { state: 'ok', data })
      } catch {
        if (alive) setResult({ state: 'error' })
      }
    })()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, n])
  return { result, reload: () => setN((x) => x + 1) }
}

const Denied = () => <p className="px-5 py-6 text-sm text-[var(--ds-text-2)] sm:px-6">You don’t have permission to view this.</p>
const Rows = ({ rows }: { rows: Array<{ label: string; value: ReactNode }> }) => (
  <dl className="divide-y divide-[var(--ds-border)]">
    {rows.map((r) => (
      <div key={r.label} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 py-3.5 sm:px-6">
        <dt className="text-sm text-[var(--ds-text-2)]">{r.label}</dt>
        <dd className="text-sm font-medium text-[var(--ds-text)]">{r.value}</dd>
      </div>
    ))}
  </dl>
)

function LinkCard({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <Link href={href} className="ds-focus block rounded-[var(--ds-radius-control)] border border-[var(--ds-border)] bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.06]">
      <span className="block text-sm font-medium text-[var(--ds-text)]">{title}</span>
      <span className="mt-1 block text-sm text-[var(--ds-text-2)]">{body}</span>
    </Link>
  )
}

/* ── General ───────────────────────────────────────────────── */

export function GeneralSection() {
  const { result, reload } = useFetched('/v1/users/me', (j) => (j?.user ? { company: j.user.company_name ?? null, role: j.user.tier ?? null, zone: j.user.timezone ?? null, active: j.user.active } : null))
  return (
    <>
      <SectionPanel title="Workspace">
        {result.state === 'loading' ? <LoadingRows rows={3} label="Loading workspace" />
          : result.state === 'denied' ? <Denied />
          : result.state === 'error' ? <ErrorPanel title="Couldn’t load workspace details" body="Nothing has changed." onRetry={reload} />
          : <Rows rows={[
              { label: 'Company', value: result.data.company ?? 'Not set' },
              { label: 'Your role', value: result.data.role ?? 'Not set' },
              { label: 'Your time zone', value: result.data.zone ?? 'Not set' },
            ]} />}
      </SectionPanel>
      <GlassCard>
        <h3 className="text-sm font-medium text-[var(--ds-text)]">Your account</h3>
        <p className="mt-1 text-sm text-[var(--ds-text-2)]">Your name, phone and time zone are edited on your profile.</p>
        <div className="mt-3"><Link href="/settings/profile" className={dsButton('secondary', 'sm')}>Open your profile</Link></div>
      </GlassCard>
    </>
  )
}

/* ── People & access (read-only summary; Team stays the operational view) ── */

export function PeopleSection() {
  const { result, reload } = useFetched<{ items: Array<{ role?: string | null }>; seats: Seats | null; warnings: string[] }>(
    '/v1/team/members',
    (j) => (Array.isArray(j?.items) ? { items: j.items, seats: j.seats ?? null, warnings: Array.isArray(j.warnings) ? j.warnings : [] } : null),
  )
  return (
    <>
      <SectionPanel title="Team members">
        {result.state === 'loading' ? <LoadingRows rows={3} label="Loading team members" />
          : result.state === 'denied' ? <Denied />
          : result.state === 'error' ? <ErrorPanel title="Couldn’t load your team" body="Nothing has changed." onRetry={reload} />
          : result.data.items.length === 0 ? <p className="px-5 py-6 text-sm text-[var(--ds-text-2)] sm:px-6">No team members yet.</p>
          : (
            <>
              <Rows rows={[
                { label: 'Members', value: result.data.items.length },
                ...roleCounts(result.data.items).map((r) => ({ label: r.label, value: r.count })),
                { label: 'Seats', value: seatsText(result.data.seats) },
              ]} />
              {(result.data.warnings.includes('members_missing_office') || result.data.warnings.includes('over_seat_allocation')) && (
                <ul className="space-y-1 border-t border-[var(--ds-border)] px-5 py-4 text-sm text-amber-200 sm:px-6">
                  {result.data.warnings.includes('members_missing_office') && <li>Some members have no office assigned.</li>}
                  {result.data.warnings.includes('over_seat_allocation') && <li>You have more members than allocated seats.</li>}
                </ul>
              )}
            </>
          )}
      </SectionPanel>
      <GlassCard>
        <h3 className="text-sm font-medium text-[var(--ds-text)]">Manage your team</h3>
        <p className="mt-1 text-sm text-[var(--ds-text-2)]">The Team view lists everyone, their performance and coaching status.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/team" className={dsButton('primary', 'sm')}>Open Team</Link>
          <Link href="/crm/manager" className={dsButton('secondary', 'sm')}>Manager Centre</Link>
        </div>
      </GlassCard>
    </>
  )
}

/* ── AI & Intelligence (links to the existing workspace) ───── */

export function AiSection() {
  return (
    <SectionPanel title="Intelligence workspace" description="Teach Gravix how your business sells. These shape how calls are analysed and scored.">
      <div className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6">
        <LinkCard href="/intelligence?tab=context" title="Context" body="Your products, buyers and language." />
        <LinkCard href="/intelligence?tab=scorecards" title="Scorecards" body="How calls are scored." />
        <LinkCard href="/intelligence?tab=objections" title="Objections" body="Your approved objection library." />
      </div>
    </SectionPanel>
  )
}

/* ── Calls & privacy ───────────────────────────────────────── */

export function CallsPrivacySection(p: {
  saved: CallVisibility | 'unknown'
  draft: CallVisibility | null
  onDraft: (v: CallVisibility) => void
  onDiscard: () => void
  onSave: () => void
  loading: boolean
  saving: boolean
  error: string | null
  onRetry: () => void
  notice: Notice
}) {
  const selected = p.draft ?? (p.saved === 'unknown' ? null : p.saved)
  const dirty = p.draft !== null && p.draft !== p.saved
  return (
    <SectionPanel title="Company call visibility" description="Choose who can open the Company calls view. This applies to your whole organisation.">
      {p.loading ? <LoadingRows rows={3} label="Loading call visibility" />
        : p.saved === 'unknown' && p.error ? <ErrorPanel title="Couldn’t load call visibility" body="Nothing has changed." onRetry={p.onRetry} />
        : (
          <>
            <fieldset className="px-5 py-5 sm:px-6" disabled={p.saving}>
              <legend className="sr-only">Who can open Company calls</legend>
              <div className="space-y-2">
                {VISIBILITY_OPTIONS.map((o) => (
                  <label key={o.value} className={`flex cursor-pointer gap-3 rounded-[var(--ds-radius-control)] border p-3.5 transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--ds-highlight)] ${selected === o.value ? 'border-[var(--ds-border-strong)] bg-white/[0.07]' : 'border-[var(--ds-border)] hover:bg-white/[0.04]'}`}>
                    <input type="radio" name="call-visibility" value={o.value} checked={selected === o.value} onChange={() => p.onDraft(o.value)} className="mt-1 accent-[var(--ds-primary)]" />
                    <span>
                      <span className="block text-sm font-medium text-[var(--ds-text)]">{o.label}{p.saved === o.value && <span className="ml-2 text-xs font-normal text-[var(--ds-text-3)]">current</span>}</span>
                      <span className="block text-sm text-[var(--ds-text-2)]">{o.description}</span>
                    </span>
                  </label>
                ))}
              </div>
              {p.saved === 'unknown' && !p.error && <p className="mt-3 text-xs text-[var(--ds-text-3)]">The current setting couldn’t be confirmed.</p>}
              {p.error && <p className="mt-3 text-xs text-red-200">{p.error}</p>}
            </fieldset>
            <StatusLine notice={p.notice} />
            <SaveBar dirty={dirty} saving={p.saving} onSave={p.onSave} onDiscard={p.onDiscard} saveLabel="Save visibility" />
          </>
        )}
    </SectionPanel>
  )
}

/* ── Coaching & scoring (review thresholds) ────────────────── */

export function CoachingScoringSection(p: {
  loading: boolean
  error: string | null
  onRetry: () => void
  available: boolean
  form: ThresholdForm
  errors: Partial<Record<keyof ThresholdForm, string>>
  dirty: boolean
  saving: boolean
  onChange: (f: ThresholdForm) => void
  onDiscard: () => void
  onSave: () => void
  notice: Notice
}) {
  return (
    <>
      <SectionPanel title="Review thresholds" meta={<Badge tone="warn">Platform-wide</Badge>} description="Calls that score below the low score are flagged for coaching; below the critical score they are treated as critical. These values are shared by every company on this platform, not only yours.">
        {p.loading ? <LoadingRows rows={3} label="Loading scoring settings" />
          : p.error ? <ErrorPanel title="Couldn’t load scoring settings" body="Nothing has changed." onRetry={p.onRetry} />
          : !p.available ? <p className="px-5 py-6 text-sm text-[var(--ds-text-2)] sm:px-6">Review thresholds aren’t available in this environment yet.</p>
          : (
            <>
              <div className="grid gap-5 px-5 py-5 sm:px-6 md:grid-cols-2">
                <Field id="low-threshold" label="Low score" hint="Calls below this score are flagged. 0 to 100." error={p.errors.low_score_threshold}>
                  <input id="low-threshold" className={dsField} inputMode="numeric" value={p.form.low_score_threshold} aria-invalid={!!p.errors.low_score_threshold} aria-describedby={`low-threshold-hint${p.errors.low_score_threshold ? ' low-threshold-error' : ''}`} onChange={(e) => p.onChange({ ...p.form, low_score_threshold: e.target.value })} />
                </Field>
                <Field id="critical-threshold" label="Critical score" hint="Calls below this score are critical. Can’t be higher than the low score." error={p.errors.critical_score_threshold}>
                  <input id="critical-threshold" className={dsField} inputMode="numeric" value={p.form.critical_score_threshold} aria-invalid={!!p.errors.critical_score_threshold} aria-describedby={`critical-threshold-hint${p.errors.critical_score_threshold ? ' critical-threshold-error' : ''}`} onChange={(e) => p.onChange({ ...p.form, critical_score_threshold: e.target.value })} />
                </Field>
              </div>
              <StatusLine notice={p.notice} />
              <SaveBar dirty={p.dirty} saving={p.saving} onSave={p.onSave} onDiscard={p.onDiscard} saveLabel="Save thresholds" />
            </>
          )}
      </SectionPanel>
      <GlassCard>
        <h3 className="text-sm font-medium text-[var(--ds-text)]">Related</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/coaching?tab=review" className={dsButton('secondary', 'sm')}>Review queue</Link>
          <Link href="/intelligence?tab=scorecards" className={dsButton('secondary', 'sm')}>Scorecards</Link>
          <Link href="/crm/manager" className={dsButton('secondary', 'sm')}>Auto-assign and team settings</Link>
        </div>
      </GlassCard>
    </>
  )
}

/* ── Sparring & gamification ───────────────────────────────── */

export function GamificationSection(p: {
  loading: boolean
  error: string | null
  onRetry: () => void
  form: GamificationForm
  errors: Partial<Record<keyof GamificationForm, string>>
  dirty: boolean
  saving: boolean
  updatedAt: string | null
  onChange: (f: GamificationForm) => void
  onDiscard: () => void
  onSave: () => void
  notice: Notice
}) {
  const upd = p.updatedAt ? new Date(p.updatedAt) : null
  return (
    <>
      <SectionPanel title="Streaks and points" meta={<Badge tone="warn">Platform-wide</Badge>} description="These values are shared by every company on this platform, not only yours, and apply straight away.">
        {p.loading ? <LoadingRows rows={3} label="Loading settings" />
          : p.error ? <ErrorPanel title="Couldn’t load these settings" body="Nothing has changed." onRetry={p.onRetry} />
          : (
            <>
              <div className="grid gap-5 px-5 py-5 sm:px-6 md:grid-cols-3">
                <Field id="streak-threshold" label="Streak threshold" hint="Days in a row before bonuses start to step up. 1 to 30." error={p.errors.streak_threshold}>
                  <input id="streak-threshold" className={dsField} inputMode="numeric" value={p.form.streak_threshold} aria-invalid={!!p.errors.streak_threshold} aria-describedby={`streak-threshold-hint${p.errors.streak_threshold ? ' streak-threshold-error' : ''}`} onChange={(e) => p.onChange({ ...p.form, streak_threshold: e.target.value })} />
                </Field>
                <Field id="xp-multiplier" label="Points multiplier" hint="Applied to all points from sparring and call scoring. 0.1 to 10. Use 1 for no boost." error={p.errors.xp_multiplier}>
                  <input id="xp-multiplier" className={dsField} inputMode="decimal" value={p.form.xp_multiplier} aria-invalid={!!p.errors.xp_multiplier} aria-describedby={`xp-multiplier-hint${p.errors.xp_multiplier ? ' xp-multiplier-error' : ''}`} onChange={(e) => p.onChange({ ...p.form, xp_multiplier: e.target.value })} />
                </Field>
                <Field id="comeback-bonus" label="Comeback bonus" hint="Bonus points when someone returns after a broken streak. 0 to 5000." error={p.errors.comeback_bonus}>
                  <input id="comeback-bonus" className={dsField} inputMode="numeric" value={p.form.comeback_bonus} aria-invalid={!!p.errors.comeback_bonus} aria-describedby={`comeback-bonus-hint${p.errors.comeback_bonus ? ' comeback-bonus-error' : ''}`} onChange={(e) => p.onChange({ ...p.form, comeback_bonus: e.target.value })} />
                </Field>
              </div>
              {upd && Number.isFinite(upd.getTime()) && <p className="px-5 pb-3 text-xs text-[var(--ds-text-3)] sm:px-6">Last updated {upd.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</p>}
              <StatusLine notice={p.notice} />
              <SaveBar dirty={p.dirty} saving={p.saving} onSave={p.onSave} onDiscard={p.onDiscard} saveLabel="Save settings" />
            </>
          )}
      </SectionPanel>
      <GlassCard>
        <h3 className="text-sm font-medium text-[var(--ds-text)]">Buyer personas</h3>
        <p className="mt-1 text-sm text-[var(--ds-text-2)]">Tune how sparring buyers behave for your company: style, objections and pressure.</p>
        <div className="mt-3"><Link href="/admin/personas" className={dsButton('secondary', 'sm')}>Open persona tuning</Link></div>
      </GlassCard>
    </>
  )
}

/* ── System (read-only) ────────────────────────────────────── */

export function SystemSection() {
  const version = useFetched('/v1/version', (j) => (j && typeof j === 'object' ? summariseVersion(j).rows : null))
  const health = useFetched('/v1/health', (j) => (j?.ok ? true : null))
  const reload = () => { version.reload(); health.reload() }
  return (
    <SectionPanel title="Environment and service status">
      {version.result.state === 'loading' ? <LoadingRows rows={4} label="Loading system information" />
        : version.result.state === 'denied' ? <Denied />
        : version.result.state === 'error' ? <ErrorPanel title="Couldn’t load system information" body="Nothing has changed." onRetry={reload} />
        : (
          <Rows rows={[
            { label: 'API status', value: health.result.state === 'ok' ? <Badge tone="good">Online</Badge> : health.result.state === 'loading' ? 'Checking…' : <Badge tone="warn">Not responding</Badge> },
            ...version.result.data.map((r) => ({ label: r.label, value: r.value })),
          ]} />
        )}
      <p className="border-t border-[var(--ds-border)] px-5 py-4 text-xs text-[var(--ds-text-3)] sm:px-6">Read-only. No keys or secrets are shown here.</p>
    </SectionPanel>
  )
}

