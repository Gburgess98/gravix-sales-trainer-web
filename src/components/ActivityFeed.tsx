'use client';
import { useMemo } from 'react';

export type ActivityItem = {
  id?: string;
  type: string;           // e.g., 'call_scored', 'assign_created', 'call_uploaded'
  summary: string;        // human-readable summary
  created_at?: string;    // ISO timestamp
};

function rel(d?: string) {
  if (!d) return '—';
  const t = new Date(d).getTime();
  if (!Number.isFinite(t)) return '—';
  const diff = Date.now() - t;
  const mins = Math.max(1, Math.round(diff / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  return `${weeks}w ago`;
}

function iconFor(t?: string) {
  switch (t) {
    case 'call_scored':
      return '🎯';
    case 'assign_created':
      return '📝';
    case 'call_uploaded':
      return '⬆️';
    case 'link_created':
      return '🔗';
    default:
      return '•';
  }
}

export default function ActivityFeed({ items }: { items: ActivityItem[] }) {
  const rows = useMemo(() => (Array.isArray(items) ? items : []), [items]);
  if (!rows.length) {
    return (
      <div className="text-sm text-neutral-400 px-4 py-3">No activity yet.</div>
    );
  }
  return (
    <ul className="divide-y divide-neutral-800">
      {rows.map((a, i) => (
        <li key={a.id || i} className="px-4 py-3 flex items-start gap-3">
          <div className="text-lg leading-none mt-[2px] shrink-0">
            {iconFor(a.type)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm line-clamp-2">{a.summary}</div>
            <div className="text-xs text-neutral-500 mt-1">
              {a.created_at ? rel(a.created_at) : '—'}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}