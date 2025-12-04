'use client';
import { useState } from 'react';
import Link from 'next/link';

export type AssignmentItem = {
  id: string;
  call_id: string;
  call_label?: string;
  drill_id: string;
  notes?: string | null;
  status?: 'open' | 'completed';
  created_at?: string;
  completed_at?: string | null;
};

async function patchAssignment(id: string, status: 'open' | 'completed') {
  const r = await fetch(`/api/proxy/v1/coach/assignments/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
    cache: 'no-store',
    credentials: 'include',
  });
  return r.json();
}

function rel(d?: string) {
  if (!d) return '';
  const ms = Date.now() - new Date(d).getTime();
  const m = Math.max(1, Math.round(ms / 60000));
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  return `${days}d ago`;
}

function labelForDrill(id: string) {
  switch (id) {
    case 'intro-basics': return 'Intro: Basics';
    case 'discovery-5qs': return 'Discovery: Top 5 Qs';
    case 'objection-too-expensive': return 'Objection: “Too expensive”';
    case 'close-trial': return 'Close: Trial close';
    default: return id;
  }
}

export default function AssignmentsList({ items }: { items: AssignmentItem[] }) {
  const [rows, setRows] = useState<AssignmentItem[]>(items || []);

  if (!rows || rows.length === 0) {
    return <div className="text-sm text-neutral-400 px-4 py-3">No assignments.</div>;
  }

  async function toggle(id: string, to: 'open' | 'completed') {
    // optimistic update
    setRows(xs => xs.map(x => (
      x.id === id
        ? { ...x, status: to, completed_at: to === 'completed' ? new Date().toISOString() : null }
        : x
    )));
    try {
      const j = await patchAssignment(id, to);
      if (!j?.ok) throw new Error(j?.error || 'patch_failed');
    } catch (e) {
      // revert on failure
      setRows(xs => xs.map(x => (
        x.id === id
          ? { ...x, status: to === 'completed' ? 'open' : 'completed' }
          : x
      )));
      console.warn('[AssignmentsList] patch failed');
    }
  }

  return (
    <ul className="divide-y divide-neutral-800">
      {rows.map((a) => {
        const done = a.status === 'completed';
        return (
          <li key={a.id} className="px-4 py-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className={`text-sm ${done ? 'line-through opacity-60' : ''}`}>
                <span className="opacity-80">{labelForDrill(a.drill_id)}</span>
                {a.call_id && (
                  <>
                    <span className="opacity-40"> · </span>
                    <Link href={`/calls/${a.call_id}`} className="underline hover:no-underline">
                      {a.call_label || a.call_id}
                    </Link>
                  </>
                )}
              </div>
              {a.notes && (
                <div className="text-xs text-neutral-400 mt-1 line-clamp-2">{a.notes}</div>
              )}
              <div className="text-xs text-neutral-500 mt-1">
                {done
                  ? `Completed ${rel(a.completed_at || a.created_at)}`
                  : `Assigned ${rel(a.created_at)}`}
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2">
              {done ? (
                <button
                  onClick={() => toggle(a.id, 'open')}
                  className="text-xs px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-900"
                  title="Reopen"
                >
                  Reopen
                </button>
              ) : (
                <button
                  onClick={() => toggle(a.id, 'completed')}
                  className="text-xs px-2 py-1 rounded border border-neutral-700 hover:bg-neutral-900"
                  title="Mark complete"
                >
                  ✓ Complete
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}