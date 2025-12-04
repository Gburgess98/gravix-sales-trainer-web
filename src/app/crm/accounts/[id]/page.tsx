'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import ActivityFeed, { ActivityItem } from '@/components/ActivityFeed';
import AssignmentsList, { AssignmentItem } from '@/components/AssignmentsList';
import { useParams } from 'next/navigation';

function ScorePill({ score }: { score: number | null | undefined }) {
  if (typeof score !== 'number' || !Number.isFinite(score)) {
    return <span className="text-xs opacity-60">—</span>;
  }
  const n = Math.round(score);
  const cls =
    n >= 80 ? 'bg-green-600/20 text-green-400'
    : n >= 60 ? 'bg-amber-600/20 text-amber-300'
    : 'bg-red-600/20 text-red-300';
  return <span className={`text-xs px-2 py-1 rounded ${cls}`}>{n}</span>;
}

export default function AccountPage() {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<{ id: string; name?: string; domain?: string } | null>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [contacts, setContacts] = useState<Array<{ id: string; first_name?: string; last_name?: string; email?: string }>>([]);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`/api/proxy/v1/crm/accounts/${id}/overview`, { cache: 'no-store', credentials: 'include' });
        const j = await r.json();
        if (!alive) return;
        if (!j?.ok) throw new Error(j?.error || 'fetch_failed');
        setAccount(j.account);
        setRecent(Array.isArray(j.recent_calls) ? j.recent_calls : []);
        setActivities(Array.isArray(j.activities) ? j.activities : []);
        setContacts(Array.isArray(j.contacts) ? j.contacts : []);
        try {
          const ar = await fetch(`/api/proxy/v1/coach/assignments/by-entity?accountId=${id}&limit=5`, { cache: 'no-store' });
          const aj = await ar.json();
          if (aj?.ok && Array.isArray(aj.items)) setAssignments(aj.items);
        } catch {}
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || 'load_failed');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  const accountName = account?.name || account?.domain || 'Account';
  const firstContact = contacts && contacts.length > 0 ? contacts[0] : null;
  const firstContactName = firstContact
    ? ([firstContact.first_name, firstContact.last_name].filter(Boolean).join(' ').trim() || firstContact.email || 'Contact')
    : null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="mb-4">
        <Link href="/crm/overview" className="text-sm text-neutral-400 hover:text-neutral-200">← Back to Overview</Link>
      </div>

      <div className="flex items-baseline justify-between gap-4 mb-2">
        <h1 className="text-xl font-semibold">{accountName}</h1>
        <div className="flex items-center gap-2">
          {contacts.length > 0 && (
            <Link
              href={`/crm/contacts/${firstContact?.id}`}
              className="text-xs px-2 py-1 rounded border border-neutral-800 hover:bg-neutral-900"
              title={firstContactName ? `Open ${firstContactName}` : 'Open a contact linked to this account'}
            >
              👤 Contacts ({contacts.length})
            </Link>
          )}
          {loading && <span className="text-xs opacity-60">Loading…</span>}
          {error && <span className="text-xs text-red-400">{error}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
        {/* Recent Calls */}
        <div className="rounded-lg border border-neutral-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800 font-medium">Recent Calls</div>
          <div className="divide-y divide-neutral-800">
            {recent.length ? recent.map((c) => (
              <div key={c.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/calls/${c.id}`} className="text-sm hover:underline truncate block">{c.filename || c.id}</Link>
                  <div className="text-xs text-neutral-500">{new Date(c.created_at).toLocaleString()}</div>
                </div>
                <ScorePill score={c.overall_score} />
              </div>
            )) : (
              <div className="px-4 py-4 text-sm text-neutral-400">No recent calls.</div>
            )}
          </div>
        </div>

        {/* Activity */}
        <div className="rounded-lg border border-neutral-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-800 font-medium">Activity</div>
          <ActivityFeed items={activities} />
        </div>

        {/* Assignments */}
        <div className="rounded-lg border border-neutral-800 overflow-hidden md:col-span-2">
          <div className="px-4 py-3 border-b border-neutral-800 font-medium">Assignments</div>
          <AssignmentsList items={assignments} />
        </div>
      </div>
    </div>
  );
}