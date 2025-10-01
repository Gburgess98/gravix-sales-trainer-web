'use client';

import { useState } from 'react';

// 👇 Read your API base from env (set NEXT_PUBLIC_API_BASE on Vercel to your tunnel URL)
// Fallback to localhost for local dev.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:4000';

// TODO: replace these once Supabase Auth is fully wired on the web.
// in src/app/upload/page.tsx
const TEMP_USER_ID = "11111111-1111-1111-8111-111111111111";
const TEMP_USER_EMAIL = 'test@gravix.ai';

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [resp, setResp] = useState<any>(null);
  const [status, setStatus] = useState<string>('idle');
  const [jobId, setJobId] = useState<string>('');

  async function onUpload() {
    try {
      if (!file) return;
      setStatus('uploading');

      // Prepare form data
      const fd = new FormData();
      fd.append('file', file);

// 🔼 Upload via same-origin proxy (injects x-user-id server-side)
const res = await fetch('/api/proxy/v1/upload', {
  method: 'POST',
  body: fd,
});

      const json = await res.json();
      setResp(json);

      if (!json.ok) {
        setStatus('error');
        return;
      }

      // ✅ At this point the file is uploaded and a call row/job created.
      //    json has: { ok, callId, jobId, filename, storagePath, ... }

      // 🔔 NEW: Notify Slack via Next.js proxy → /api/calls → your API /v1/calls
      // This keeps the webhook secret server-side.
      await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: TEMP_USER_ID,
          userEmail: TEMP_USER_EMAIL,
          fileName: json.filename ?? file.name,
          storagePath: json.storagePath,     // exakt path your API returned
          sizeBytes: file.size,
          durationSec: undefined,            // pass if you measure it client-side
        }),
      }).catch((e) => {
        // Don’t hard-fail the UX if Slack notify hiccups
        console.error('Slack notify failed:', e);
      });

      // Continue your existing job polling flow
      if (json.jobId) {
        setJobId(json.jobId);
        setStatus('queued');
        pollJob(json.jobId);
      } else {
        setStatus('processed'); // upload done, no job returned (edge)
      }
    } catch (e) {
      console.error(e);
      setStatus('error');
    }
  }

  async function pollJob(id: string) {
    setStatus('processing');
    const tick = async () => {
      try {
        const r = await fetch(`${API_BASE}/v1/jobs/${id}`);
        const j = await r.json();
        if (!j.ok) {
          setStatus('error');
          return;
        }
        const s: string = j.job.status;
        if (s === 'succeeded' || s === 'failed') {
          setStatus(s);
          return;
        }
        setTimeout(tick, 1200);
      } catch {
        setStatus('error');
      }
    };
    tick();
  }

  return (
    <div className="min-h-screen p-8 space-y-4">
      <h1 className="text-2xl font-bold">Upload a call</h1>

      <input
        type="file"
        accept=".mp3,.wav,.m4a,.json"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />

      <button
        onClick={onUpload}
        disabled={!file || status === 'uploading'}
        className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
      >
        {status === 'uploading' ? 'Uploading…' : 'Upload'}
      </button>

      <div className="text-sm">
        <div>
          Status: <span className="font-mono">{status}</span>
        </div>
        {jobId && (
          <div>
            Job ID: <span className="font-mono">{jobId}</span>
          </div>
        )}
      </div>

      {resp && (
        <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
          {JSON.stringify(resp, null, 2)}
        </pre>
      )}
    </div>
  );
}