'use client';

import { useState } from 'react';
import { createPin } from '@/lib/api';

export default function PinButton({ callId }: { callId: string }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleCreate() {
    setLoading(true); setMsg(null);
    try {
      // demo: pin at 12s
      const res = await createPin({ callId, t: 12, note: 'Test pin' });
      setMsg(`Created pin ${res?.pin?.id ?? ''}`);
    } catch (e: any) {
      setMsg(e.message ?? 'Failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleCreate}
        disabled={loading}
        className="border rounded px-3 py-1 text-sm"
      >
        {loading ? 'Creating…' : 'Create Test Pin'}
      </button>
      {msg && <span className="text-xs opacity-70">{msg}</span>}
    </div>
  );
}
