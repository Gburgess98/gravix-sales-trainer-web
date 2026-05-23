'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge, ScorePill } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingText } from '@/components/ui/loading-skeleton';

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

export default function CrmAccountsPage() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<
    'default' | 'needs_intervention'
  >('default');

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch('/api/proxy/v1/accounts', {
          cache: 'no-store',
        });

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
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">
            CRM
          </div>

          <h1 className="mt-0.5 text-xl font-semibold text-white">
            Accounts
          </h1>

          <p className="mt-0.5 text-sm text-neutral-400">
            Account activity, contacts, call history, and relationship intelligence.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <StatCard label="Accounts" value={filteredAccounts.length} size="sm" />
          <StatCard label="Contacts" value={totals.contacts} size="sm" />
          <StatCard label="Calls" value={totals.calls} size="sm" />
        </div>
      </div>

      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search accounts or domains"
            className="w-full max-w-md rounded-xl border border-neutral-800 bg-black/40 px-4 py-2 text-sm text-white outline-none transition-all focus:border-cyan-500/40"
          />

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSortMode('default')}
              className={`rounded-xl border px-3 py-2 text-xs transition-all ${sortMode === 'default'
                ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'
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
            className="border-red-500/20 bg-red-500/5"
          />
          <StatCard
            label="Unassigned Accounts"
            value={filteredAccounts.filter((a) => a.ownership_status !== 'assigned').length}
            subtext="without assigned ownership"
            variant="warning"
            className="border-amber-500/20 bg-amber-500/5"
          />
          <StatCard
            label="Managed Accounts"
            value={filteredAccounts.filter((a) => a.ownership_status === 'assigned').length}
            subtext="actively owned by reps/managers"
            variant="info"
            className="border-cyan-500/20 bg-cyan-500/5"
          />
        </div>
      )}

      {!loading && !error && filteredAccounts.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredAccounts.map((account) => (
            <Link
              key={account.id}
              href={`/crm/accounts/${account.id}`}
              className="group rounded-2xl border border-neutral-800 bg-neutral-950 p-5 transition-all duration-200 hover:border-cyan-500/40 hover:bg-neutral-900/70"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold text-white transition-colors group-hover:text-cyan-200">
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
                      <div className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-cyan-200">
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
                      ?.escalation_route || 'manager_queue'}
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

                  <div className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-200">
                    Open →
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}