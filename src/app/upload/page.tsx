// src/app/upload/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { uploadCall } from "@/lib/upload";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [progress, setProgress] = useState<number>(0); // NEW

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setMsg(null);
    setResult(null);
    setProgress(0); // reset bar

    try {
      const res = await uploadCall(file, { onProgress: setProgress }); // pass progress callback
      setResult(res);
      setMsg("Uploaded ✓");
    } catch (e: any) {
      setMsg(e?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Upload a Call</h1>
        <Link href="/recent-calls" className="underline">Recent calls</Link>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div
          className="rounded-2xl border border-dashed p-6 text-sm"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) setFile(f);
          }}
        >
          <div className="opacity-70">Drag & drop a file, or choose below.</div>
          <input
            type="file"
            accept="audio/*,.wav,.mp3,.m4a,.webm,.json"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-3 block"
          />
          {file && (
            <div className="mt-2 text-xs opacity-80">
              Selected: <span className="font-mono">{file.name}</span> ({file.type || "n/a"},{" "}
              {Math.round(file.size / 1024)} KB)
            </div>
          )}
        </div>

        {/* Progress bar (shows only while uploading) */}
        {busy && (
          <div className="w-full h-2 bg-zinc-700 rounded overflow-hidden">
            <div
              className="h-2 bg-white/70 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <button
          type="submit"
          disabled={!file || busy}
          className="border rounded px-3 py-1 text-sm"
        >
          {busy ? "Uploading…" : "Upload"}
        </button>

        {msg && (
          <div className={`text-sm ${/✓/.test(msg) ? "text-green-300" : "text-red-300"}`}>
            {msg}
          </div>
        )}
      </form>

      {result?.ok && (
        <div className="rounded-xl border p-4 space-y-2">
          <div className="text-sm opacity-80">
            Target: <span className="font-mono">{result.storagePath || result.path}</span>
          </div>
          <div className="text-sm opacity-80">
            Job: <span className="font-mono">{result.jobId || "—"}</span>
          </div>
          <Link href={`/calls/${result.callId}`} className="inline-block underline">
            Open call →
          </Link>
        </div>
      )}
    </div>
  );
}