'use client';

import { useEffect, useState } from 'react';
import { deletePin, listPins } from '@/lib/api';

type Pin = {
  id: string;
  call_id: string;
  user_id: string;
  t: number;
  note: string | null;
  created_at: string;
};

export default function PinList({ callId }: { callId: string }) {
  const [pins, setPins] = useState<Pin[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    try {
      setErr(null);
      const res = await listPins(callId);
      setPins(res.pins ?? []);
    } catch (e: any) {
      setErr(e.message ?? 'Failed to load pins');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [callId]);

  async function onDelete(id: string) {
    try {
      await deletePin(id);
      setPins((prev) => prev.filter(p => p.id !== id));
    } catch (e: any) {
      setErr(e.message ?? 'Failed to delete');
    }
  }

  if (loading) return <p className="text-sm opacity-70">Loading pins…</p>;
  if (err) return <p className="text-sm text-red-600">{err}</p>;
  if (!pins.length) return <p className="text-sm opacity-70">No pins yet.</p>;

  return (
    <ul className="divide-y border rounded">
      {pins.map(p => (
        <li key={p.id} className="flex items-center justify-between px-3 py-2">
          <div className="text-sm">
            <div className="font-medium">t={p.t}s</div>
            {p.note && <div className="opacity-70">{p.note}</div>}
          </div>
          <button
            onClick={() => onDelete(p.id)}
            className="border rounded px-2 py-1 text-xs"
          >
            Delete
          </button>
        </li>
      ))}
    </ul>
  );
}