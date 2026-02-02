'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { completeCrmAction } from '@/lib/api';

export type AssignmentAction = {
  id: string;
  title: string;
  due_at?: string | null;
  importance?: string | null;
  status?: string | null;
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

  return (
    <div className="rounded border p-3 text-sm space-y-3">
      <div className="flex items-center gap-4">
        <span className="px-2 py-1 rounded border">🟡 Open: {open}</span>
        <span className="px-2 py-1 rounded border">🟠 Due soon: {dueSoon}</span>
        <span className="px-2 py-1 rounded border">✅ Completed 7d: {completed7d}</span>
      </div>

      {actions.length > 0 ? (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-neutral-400">Today’s Actions</div>
          {actions.map((a) => (
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