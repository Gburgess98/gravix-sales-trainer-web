'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { proxyFetch } from '@/lib/api';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge, ScorePill } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingText } from '@/components/ui/loading-skeleton';
import { useToast } from '@/components/Toast';
import { EntitySearch, type EntityHit } from '@/components/ui/entity-search';
import { PageContainer } from '@/components/layout/page-container';
import { PageHeader } from '@/components/layout/page-header';

type AccountRow = {
  id: string;
  name: string;
  domain?: string | null;
  latest_activity_at?: string | null;
  stats?: {
    contacts?: number;
    calls?: number;
  };
  avg_score?: number | null;

  owner?: {
    id?: string;
    email?: string | null;
    full_name?: string | null;
    role?: string | null;
  } | null;

  ownership_status?: 'assigned' | 'unassigned';

  coaching_ownership?: {
    escalation_route?: string | null;
    manager_rescue_workflow?: string | null;
  } | null;
};

function formatRelativeDate(input?: string | null) {
  if (!input) return 'No activity';

  const date = new Date(input);

  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

type CreateAccountForm = { name: string; domain: string; owner_id: string }
const EMPTY_ACCOUNT_FORM: CreateAccountForm = { name: '', domain: '', owner_id: '' }

export default function CrmAccountsPage() {
  const toast = useToast();
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<'default' | 'needs_intervention'>('default');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateAccountForm>(EMPTY_ACCOUNT_FORM);
  const [createSaving, setCreateSaving] = useState(false);
  // Separate entity selections — not stored in form strings
  const [accountOwnerSelection, setAccountOwnerSelection] = useState<EntityHit | null>(null);
  const [contactAccountSelection, setContactAccountSelection] = useState<EntityHit | null>(null);
  const [contactCreateOpen, setContactCreateOpen] = useState(false);
  const [contactCreateForm, setContactCreateForm] = useState({ first_name: '', last_name: '', email: '', company: '', role: '' });
  const [contactCreateSaving, setContactCreateSaving] = useState(false);

  async function handleCreateContact(e: React.FormEvent) {
    e.preventDefault();
    if (!contactCreateForm.first_name.trim() && !contactCreateForm.email.trim()) {
      toast.error('Name or email is required.'); return;
    }
    setContactCreateSaving(true);
    try {
      const res = await proxyFetch('/v1/crm/contacts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          first_name: contactCreateForm.first_name.trim() || undefined,
          last_name: contactCreateForm.last_name.trim() || undefined,
          email: contactCreateForm.email.trim() || undefined,
          role: contactCreateForm.role.trim() || undefined,
          account_id: contactAccountSelection?.id || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.ok === false) throw new Error(data?.error || 'Failed to create contact');
      toast.success('Contact created.');
      setContactCreateOpen(false);
      setContactCreateForm({ first_name: '', last_name: '', email: '', company: '', role: '' });
      setContactAccountSelection(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create contact');
    } finally {
      setContactCreateSaving(false);
    }
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!createForm.name.trim()) { toast.error('Account name is required.'); return; }
    setCreateSaving(true);
    try {
      const res = await proxyFetch('/v1/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name.trim(),
          domain: createForm.domain.trim() || undefined,
          owner_id: accountOwnerSelection?.id || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.ok === false) throw new Error(data?.error || 'Failed to create account');
      const created: AccountRow = data.account ?? { id: data.id ?? String(Date.now()), name: createForm.name.trim(), domain: createForm.domain.trim() || null };
      setAccounts((prev) => [created, ...prev]);
      toast.success(`Account "${created.name}" created.`);
      setCreateOpen(false);
      setCreateForm(EMPTY_ACCOUNT_FORM);
      setAccountOwnerSelection(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to create account');
    } finally {
      setCreateSaving(false);
    }
  }

  function updateCreateForm(k: keyof CreateAccountForm, v: string) {
    setCreateForm((prev) => ({ ...prev, [k]: v }));
  }

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await proxyFetch('/v1/accounts', { cache: 'no-store' });

        const data = await res.json();

        if (!res.ok || data?.ok === false) {
          throw new Error(data?.error || 'Failed loading accounts');
        }

        if (!active) return;

        setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
      } catch (e: any) {
        console.error('Failed loading accounts', e);

        if (!active) return;

        setError(e?.message || 'Failed loading accounts');
      } finally {
        if (!active) return;

        setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const filteredAccounts = useMemo(() => {
    const q = search.trim().toLowerCase();

    let next = [...accounts];

    if (q) {
      next = next.filter((account) => {
        return (
          account.name?.toLowerCase().includes(q) ||
          account.domain?.toLowerCase().includes(q)
        );
      });
    }

    if (sortMode === 'needs_intervention') {
      next.sort((a, b) => {
        const aRisk =
          (a.ownership_status === 'unassigned' ? 2 : 0) +
          ((a.avg_score || 0) < 60 ? 2 : 0) +
          ((a.stats?.calls || 0) === 0 ? 1 : 0);

        const bRisk =
          (b.ownership_status === 'unassigned' ? 2 : 0) +
          ((b.avg_score || 0) < 60 ? 2 : 0) +
          ((b.stats?.calls || 0) === 0 ? 1 : 0);

        return bRisk - aRisk;
      });
    }

    return next;
  }, [accounts, search, sortMode]);

  const totals = useMemo(() => {
    return filteredAccounts.reduce(
      (acc, account) => {
        acc.contacts += Number(account.stats?.contacts || 0);
        acc.calls += Number(account.stats?.calls || 0);
        return acc;
      },
      {
        contacts: 0,
        calls: 0,
      }
    );
  }, [filteredAccounts]);

  return (
    <PageContainer>
      <PageHeader
        title="Accounts"
        subtitle="Account activity, contacts, call history, and relationship intelligence."
        actions={
          /* KPI cards + vertical action stack — items-stretch keeps equal heights */
          <div className="flex items-stretch gap-3">
            <StatCard label="Accounts" value={filteredAccounts.length} size="sm" className="w-28" />
            <StatCard label="Contacts" value={totals.contacts} size="sm" className="w-28" />
            <StatCard label="Calls" value={totals.calls} size="sm" className="w-28" />

            {/* Action stack: two buttons fill the combined card height */}
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="flex flex-1 items-center justify-center rounded-lg border border-indigo-500/20 bg-indigo-600/20 px-4 text-xs font-semibold text-indigo-200 hover:bg-indigo-600/30 transition-colors whitespace-nowrap"
              >
                + New Account
              </button>
              <button
                type="button"
                onClick={() => setContactCreateOpen(true)}
                className="flex flex-1 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900/60 px-4 text-xs font-semibold text-neutral-300 hover:bg-neutral-800 transition-colors whitespace-nowrap"
              >
                + New Contact
              </button>
            </div>
          </div>
        }
      />

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search accounts or domains"
            className="w-full max-w-md rounded-xl border border-neutral-800 bg-black/40 px-4 py-2 text-sm text-white outline-none transition-all focus:border-indigo-500/50"
          />

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSortMode('default')}
              className={`rounded-xl border px-3 py-2 text-xs transition-all ${sortMode === 'default'
                ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-200'
                : 'border-neutral-800 bg-black/30 text-neutral-400 hover:border-neutral-700'
                }`}
            >
              Default View
            </button>

            <button
              type="button"
              onClick={() => setSortMode('needs_intervention')}
              className={`rounded-xl border px-3 py-2 text-xs transition-all ${sortMode === 'needs_intervention'
                ? 'border-red-500/30 bg-red-500/10 text-red-200'
                : 'border-neutral-800 bg-black/30 text-neutral-400 hover:border-neutral-700'
                }`}
            >
              Needs Intervention
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="rounded-2xl border border-neutral-800 bg-neutral-950 px-5 py-4">
          <LoadingText text="Loading customer accounts…" />
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && filteredAccounts.length === 0 && (
        <EmptyState message="No accounts found." />
      )}

      {!loading && !error && (
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            label="Rescue Queue"
            value={filteredAccounts.filter((a) => a.ownership_status === 'unassigned' || (a.avg_score || 0) < 60).length}
            subtext="requiring manager intervention"
            variant="danger"
          />
          <StatCard
            label="Unassigned Accounts"
            value={filteredAccounts.filter((a) => a.ownership_status !== 'assigned').length}
            subtext="without assigned ownership"
            variant="warning"
          />
          <StatCard
            label="Managed Accounts"
            value={filteredAccounts.filter((a) => a.ownership_status === 'assigned').length}
            subtext="actively owned by reps/managers"
            variant="info"
          />
        </div>
      )}

      {/* ── Create Contact Modal ── */}
      {contactCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => { setContactCreateOpen(false); setContactAccountSelection(null); }}
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-white">New Contact</h2>
                <p className="text-xs text-neutral-500 mt-0.5">Create a standalone contact to link to accounts later.</p>
              </div>
              <button
                type="button"
                onClick={() => { setContactCreateOpen(false); setContactAccountSelection(null); }}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateContact} className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">First Name</label>
                  <input
                    type="text"
                    value={contactCreateForm.first_name}
                    onChange={(e) => setContactCreateForm((p) => ({ ...p, first_name: e.target.value }))}
                    placeholder="Jane"
                    className="w-full rounded-lg border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 placeholder:text-neutral-600"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">Last Name</label>
                  <input
                    type="text"
                    value={contactCreateForm.last_name}
                    onChange={(e) => setContactCreateForm((p) => ({ ...p, last_name: e.target.value }))}
                    placeholder="Smith"
                    className="w-full rounded-lg border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 placeholder:text-neutral-600"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">Email</label>
                <input
                  type="email"
                  value={contactCreateForm.email}
                  onChange={(e) => setContactCreateForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="jane@company.com"
                  className="w-full rounded-lg border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 placeholder:text-neutral-600"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">Account <span className="text-neutral-600">(optional)</span></label>
                <EntitySearch
                  type="account"
                  value={contactAccountSelection}
                  onChange={setContactAccountSelection}
                  placeholder="Link to an account…"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">Role <span className="text-neutral-600">(optional)</span></label>
                <input
                  type="text"
                  value={contactCreateForm.role}
                  onChange={(e) => setContactCreateForm((p) => ({ ...p, role: e.target.value }))}
                  placeholder="VP Sales"
                  className="w-full rounded-lg border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 placeholder:text-neutral-600"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setContactCreateOpen(false); setContactAccountSelection(null); }}
                  className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={contactCreateSaving || (!contactCreateForm.first_name.trim() && !contactCreateForm.email.trim())}
                  className="rounded-lg border border-indigo-500/20 bg-indigo-600/20 px-3 py-1.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {contactCreateSaving ? 'Creating…' : 'Create Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Create Account Modal ── */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => { setCreateOpen(false); setCreateForm(EMPTY_ACCOUNT_FORM); }}
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-white">New Account</h2>
                <p className="text-xs text-neutral-500 mt-0.5">Create a new CRM account.</p>
              </div>
              <button
                type="button"
                onClick={() => { setCreateOpen(false); setCreateForm(EMPTY_ACCOUNT_FORM); }}
                className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 transition-colors"
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateAccount} className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">Account Name <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  required
                  value={createForm.name}
                  onChange={(e) => updateCreateForm('name', e.target.value)}
                  placeholder="Acme Corp"
                  className="w-full rounded-lg border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 placeholder:text-neutral-600"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">Domain</label>
                <input
                  type="text"
                  value={createForm.domain}
                  onChange={(e) => updateCreateForm('domain', e.target.value)}
                  placeholder="acme.com"
                  className="w-full rounded-lg border border-neutral-800 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50 placeholder:text-neutral-600"
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-[0.1em] text-neutral-500 mb-1">Owner <span className="text-neutral-600">(optional)</span></label>
                <EntitySearch
                  type="rep"
                  value={accountOwnerSelection}
                  onChange={setAccountOwnerSelection}
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setCreateOpen(false); setCreateForm(EMPTY_ACCOUNT_FORM); }}
                  className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:bg-neutral-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSaving || !createForm.name.trim()}
                  className="rounded-lg border border-indigo-500/20 bg-indigo-600/20 px-3 py-1.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {createSaving ? 'Creating…' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {!loading && !error && filteredAccounts.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredAccounts.map((account) => (
            <Link
              key={account.id}
              href={`/crm/accounts/${account.id}`}
              className="group rounded-2xl border border-neutral-800 bg-neutral-950 p-5 transition-all duration-200 hover:border-indigo-500/40 hover:bg-neutral-900/70"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-white transition-colors group-hover:text-indigo-200">
                    {account.name}
                  </div>

                  <div className="mt-1 text-sm text-neutral-400">
                    {account.domain || 'No domain'}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <div className="rounded-full border border-neutral-700 bg-black/40 px-2 py-1 text-neutral-300">
                      {account.owner?.full_name ||
                        account.owner?.email ||
                        'No owner assigned'}
                    </div>

                    {account.owner?.role ? (
                      <div className="rounded-full border border-neutral-700 bg-black/40 px-2 py-1 text-neutral-300">
                        {account.owner.role}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <StatusBadge
                    status={account.ownership_status === 'assigned' ? 'assigned' : 'unassigned'}
                    label={account.ownership_status === 'assigned' ? 'Owned' : 'Unassigned'}
                  />
                  {(account.avg_score || 0) < 60 ? (
                    <StatusBadge status="overdue" label="At Risk" />
                  ) : null}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-neutral-800 bg-black/30 p-3">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                    Contacts
                  </div>

                  <div className="mt-1 text-lg font-semibold text-white">
                    {account.stats?.contacts || 0}
                  </div>
                </div>

                <div className="rounded-xl border border-neutral-800 bg-black/30 p-3">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                    Calls
                  </div>

                  <div className="mt-1 text-lg font-semibold text-white">
                    {account.stats?.calls || 0}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-neutral-800 bg-black/30 p-3">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                    Account Health
                  </div>
                  <div className="mt-1">
                    <ScorePill score={Math.round(account.avg_score || 0)} />
                  </div>
                </div>

                <div className="rounded-xl border border-neutral-800 bg-black/30 p-3">
                  <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                    Escalation
                  </div>

                  <div className="mt-1 text-xs text-white leading-relaxed">
                    {account.coaching_ownership
                      ?.escalation_route || 'Manager queue'}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-neutral-800 pt-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
                    Latest activity
                  </div>

                  <div className="mt-1 text-xs text-neutral-300">
                    {formatRelativeDate(account.latest_activity_at)}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  {(account.avg_score || 0) < 60 ? (
                    <StatusBadge status="at_risk" label="Needs Intervention" />
                  ) : null}

                  <div className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-200">
                    Open →
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  );
}