"use client";

import { useState } from "react";
import Link from "next/link";
import { signedInitUpload, finalizeSignedUpload } from "@/lib/api";

const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100MB client-side guardrail

function formatKB(n: number) {
  return `${Math.round(n / 1024)} KB`;
}

function formatMB(n: number) {
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function uploadWithProgress(url: string, file: File, contentType: string, onProgress?: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", contentType || "application/octet-stream");
    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return;
      const pct = Math.min(100, Math.max(0, Math.round((evt.loaded / evt.total) * 100)));
      onProgress?.(pct);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      reject(new Error(`Upload failed with HTTP ${xhr.status}`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [progress, setProgress] = useState<number>(0);
  const [lastFile, setLastFile] = useState<File | null>(null);

  async function doUpload(f: File) {
    setBusy(true);
    setMsg(null);
    setResult(null);
    setProgress(0);
    try {
      const meta = {
        filename: f.name,
        mime: f.type || "application/octet-stream",
        size: f.size,
      };
      // 1) Ask API for a signed PUT URL and target path
      const init = await signedInitUpload(meta); // { ok, path, url, id, kind }
      // 2) Upload file to storage (presigned URL) with progress
      await uploadWithProgress(init.url, f, meta.mime, setProgress);
      // 3) Finalize so API creates DB row and enqueues jobs
      const fin = await finalizeSignedUpload({
        path: init.path,
        filename: meta.filename,
        mime: meta.mime,
        size: meta.size,
      });
      setResult(fin);
      setMsg("Uploaded ✓");
      setProgress(100);
    } catch (e: any) {
      setMsg(e?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;

    // client-side guardrails
    if (file.size > MAX_FILE_BYTES) {
      setMsg(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max 100MB)`);
      return;
    }
    setLastFile(file);
    await doUpload(file);
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
            if (f) { setFile(f); setLastFile(f); }
          }}
        >
          <div className="opacity-70">Drag & drop a file, or choose below.</div>
          <input
            type="file"
            accept="audio/*,.wav,.mp3,.m4a,.webm,.json"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f) setLastFile(f);
            }}
            className="mt-3 block"
          />
          {file && (
            <div className="mt-2 text-xs opacity-80">
              Selected: <span className="font-mono">{file.name}</span> ({file.type || "n/a"}, {formatKB(file.size)} · {formatMB(file.size)})
              {file.size > MAX_FILE_BYTES && (
                <span className="ml-2 text-red-300">(too large, max 100MB)</span>
              )}
            </div>
          )}
        </div>

        {/* Progress bar (shows only while uploading) */}
        {busy && (
          <div className="w-full h-2 bg-zinc-700 rounded overflow-hidden">
            <div className="h-2 bg-white/70 transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}

        <button
          type="submit"
          disabled={!file || busy || (file ? file.size > MAX_FILE_BYTES : false)}
          className="border rounded px-3 py-1 text-sm disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Upload"}
        </button>
        {lastFile && !busy && (
          <button
            type="button"
            onClick={() => doUpload(lastFile)}
            className="ml-2 border rounded px-3 py-1 text-sm"
          >
            Retry last file
          </button>
        )}

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