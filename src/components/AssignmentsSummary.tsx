'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { completeCrmAction } from '@/lib/api';

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
};

type AssignmentsSummaryResp = {
  ok: boolean;
  summary?: {
    total: number;
    open: number;
    completed: number;
    overdue: number;
    today_focus?: AssignmentItem | null;
  };
  items?: AssignmentItem[];
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

  const [loaded, setLoaded] = useState(false);
  const [openCount, setOpenCount] = useState(open);
  const [dueSoonCount, setDueSoonCount] = useState(dueSoon);
  const [completedCount, setCompletedCount] = useState(completed7d);
  const [actionItems, setActionItems] = useState<AssignmentAction[]>(actions);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/proxy/v1/assignments/summary');
        const json: AssignmentsSummaryResp = await res.json();
        if (cancelled || !json || json.ok === false) return;

        const s = json.summary;
        if (!s) return;

        setOpenCount(s.open ?? 0);
        setDueSoonCount(s.overdue ?? 0);
        setCompletedCount(s.completed ?? 0);

        const today = s.today_focus;
        if (today) {
          setActionItems([
            {
              id: today.id,
              title: today.title,
              due_at: today.due_at ?? null,
              status: today.status ?? null,
            },
          ]);
        } else {
          setActionItems([]);
        }

        setLoaded(true);
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
      <div className="flex items-center gap-4">
        <span className="px-2 py-1 rounded border">🟡 Open: {openCount}</span>
        <span className="px-2 py-1 rounded border">🟠 Due soon: {dueSoonCount}</span>
        <span className="px-2 py-1 rounded border">✅ Completed: {completedCount}</span>
      </div>

      {actionItems.length > 0 ? (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-neutral-400">Today’s Actions</div>
          {actionItems.map((a) => (
            <div key={a.id} className="flex items-start justify-between gap-3 border rounded p-2">
              <div className="min-w-0">
                <div className="font-medium truncate">{a.title}</div>
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