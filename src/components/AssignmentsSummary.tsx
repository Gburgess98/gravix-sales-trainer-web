'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { completeCrmAction, proxyFetch } from '@/lib/api';

export type AssignmentAction = {
  id: string;
  title: string;
  due_at?: string | null;
  importance?: string | null;
  status?: string | null;
};

type AssignmentItem = {
  id: string;
  title: string;
  due_at?: string | null;
  status?: string | null;
  source?: string | null;
  flagged_call?: boolean | null;
  threshold_band?: string | null;
  needs_manager_review?: boolean | null;
};

type AssignmentsSummaryResp = {
  ok: boolean;
  summary?: {
    total?: number;
    open?: number;
    completed?: number;
    overdue?: number;
    open_count?: number;
    completed_count?: number;
    overdue_count?: number;
    due_today_count?: number;
    flagged?: number;
    critical?: number;
    flagged_count?: number;
    critical_count?: number;
    auto_created_count?: number;
    manual_created_count?: number;
    completion_rate?: number;
    today_focus?: AssignmentItem | null;
  };
  today_focus?: AssignmentItem | null;
  items?: AssignmentItem[];
  assignments?: AssignmentItem[];
};

export default function AssignmentsSummary(props: {
  open?: number;
  dueSoon?: number;
  completed7d?: number;
  actions?: AssignmentAction[]; // optional: today’s actions
}) {
  const { open = 0, dueSoon = 0, completed7d = 0, actions = [] } = props;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const [openCount, setOpenCount] = useState(open);
  const [dueSoonCount, setDueSoonCount] = useState(dueSoon);
  const [completedCount, setCompletedCount] = useState(completed7d);
  const [actionItems, setActionItems] = useState<AssignmentAction[]>(actions);
  const [flaggedCount, setFlaggedCount] = useState(0);
  const [criticalCount, setCriticalCount] = useState(0);
  const [autoCreatedCount, setAutoCreatedCount] = useState(0);
  const [manualCreatedCount, setManualCreatedCount] = useState(0);
  const [completionRate, setCompletionRate] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await proxyFetch('/v1/assignments/summary');
        const json: AssignmentsSummaryResp = await res.json();
        if (cancelled || !json || json.ok === false) return;

        const s = json.summary;
        if (!s) return;

        setOpenCount(s.open_count ?? s.open ?? 0);
        setDueSoonCount(s.due_today_count ?? s.overdue_count ?? s.overdue ?? 0);
        setCompletedCount(s.completed_count ?? s.completed ?? 0);
        setFlaggedCount(s.flagged_count ?? s.flagged ?? 0);
        setCriticalCount(s.critical_count ?? s.critical ?? 0);
        setAutoCreatedCount(s.auto_created_count ?? 0);
        setManualCreatedCount(s.manual_created_count ?? 0);
        setCompletionRate(s.completion_rate ?? 0);

        const today = json.today_focus ?? s.today_focus;
        if (today) {
          setActionItems([
            {
              id: today.id,
              title: today.title,
              due_at: today.due_at ?? null,
              status: today.status ?? null,
              importance:
                today.threshold_band === 'critical' || today.needs_manager_review
                  ? 'critical'
                  : today.flagged_call || today.threshold_band
                    ? 'flagged'
                    : today.source ?? null,
            },
          ]);
        } else {
          setActionItems([]);
        }
      } catch (e) {
        console.error('AssignmentsSummary load failed', e);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="rounded border p-3 text-sm space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="px-2 py-1 rounded border">🟡 Open: {openCount}</span>
        <span className="px-2 py-1 rounded border">🟠 Due soon: {dueSoonCount}</span>
        <span className="px-2 py-1 rounded border">✅ Completed: {completedCount}</span>
        <span className="px-2 py-1 rounded border border-amber-700/60 text-amber-300">⚠️ Flagged: {flaggedCount}</span>
        <span className="px-2 py-1 rounded border border-red-700/60 text-red-300">🚨 Critical: {criticalCount}</span>
        <span className="px-2 py-1 rounded border border-sky-700/60 text-sky-300">🤖 Auto: {autoCreatedCount}</span>
        <span className="px-2 py-1 rounded border border-neutral-700 text-neutral-300">Manual: {manualCreatedCount}</span>
        <span className="px-2 py-1 rounded border border-emerald-700/60 text-emerald-300">Completion: {completionRate}%</span>
      </div>

      {actionItems.length > 0 ? (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-neutral-400">Today’s Actions</div>
          {actionItems.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-3 border rounded p-2">
              <div className="min-w-0">
                <div className="font-medium truncate">{a.title}</div>
                {a.importance ? (
                  <div className="mt-1 text-[11px] uppercase tracking-wide text-neutral-400">
                    Source: <span className={a.importance === 'critical' ? 'text-red-300' : a.importance === 'flagged' ? 'text-amber-300' : 'text-neutral-300'}>{a.importance}</span>
                  </div>
                ) : null}
                {a.due_at ? (
                  <div className="text-xs text-neutral-400">Due {new Date(a.due_at).toLocaleDateString()}</div>
                ) : null}
              </div>

              <button
                type="button"
                disabled={isPending}
                className="text-xs px-2 py-1 rounded border border-neutral-700 hover:border-neutral-500 disabled:opacity-50"
                onClick={() => {
                  setErr(null);
                  startTransition(async () => {
                    try {
                      await completeCrmAction(a.id);
                      router.refresh();
                    } catch (e: any) {
                      setErr(e?.message || 'Failed to complete');
                    }
                  });
                }}
              >
                {isPending ? 'Completing…' : 'Complete'}
              </button>
            </div>
          ))}
          {err ? <div className="text-xs text-red-400">{err}</div> : null}
        </div>
      ) : null}
    </div>
  );
}