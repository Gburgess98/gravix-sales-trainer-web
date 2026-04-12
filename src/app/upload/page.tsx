"use client";

import { useMemo, useState } from "react";
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
  const [profileLabel, setProfileLabel] = useState("");
  const [companyTag, setCompanyTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [progress, setProgress] = useState<number>(0);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [uploadStage, setUploadStage] = useState<"idle" | "init" | "put" | "finalize" | "processing" | "done" | "error">("idle");
  const [lastErrorStage, setLastErrorStage] = useState<null | "init" | "put" | "finalize" | "processing">(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);

  const cleanProfileLabel = useMemo(() => profileLabel.trim(), [profileLabel]);
  const cleanCompanyTag = useMemo(() => companyTag.trim(), [companyTag]);
  const fileTooLarge = !!file && file.size > MAX_FILE_BYTES;
  const canUpload = !!file && !busy && !fileTooLarge && cleanProfileLabel.length > 0;

  function friendlyUploadError(stage: "init" | "put" | "finalize" | "processing", err: any) {
    const raw = String(err?.message || "Unknown upload error");
    if (stage === "init") return `Could not start upload: ${raw}`;
    if (stage === "put") return `File upload to storage failed: ${raw}`;
    if (stage === "finalize") return `Upload finished but call creation failed: ${raw}`;
    return `Upload completed but processing failed: ${raw}`;
  }

  async function waitForJob(jobId: string, maxMs = 20000) {
    const started = Date.now();

    while (Date.now() - started < maxMs) {
      const r = await fetch(`/api/proxy/v1/jobs/${encodeURIComponent(jobId)}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));

      if (!r.ok || j?.ok === false) {
        throw new Error(j?.error || `HTTP ${r.status}`);
      }

      const status = String(j?.status || j?.job?.status || "");
      setJobStatus(status);

      if (status === "succeeded") return j.job ?? j;
      if (status === "failed") {
        throw new Error(String(j?.job?.error || j?.error || "processing_failed"));
      }

      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    return null;
  }

  async function doUpload(f: File) {
    setBusy(true);
    setMsg(null);
    setResult(null);
    setProgress(0);
    setJobStatus(null);
    setLastErrorStage(null);
    setUploadStage("init");

    try {
      const meta = {
        filename: f.name,
        mime: f.type || "application/octet-stream",
        size: f.size,
        profileLabel: cleanProfileLabel,
        companyTag: cleanCompanyTag || null,
      };

      // 1) Ask API for a signed PUT URL and target path
      setUploadStage("init");
      const init = await signedInitUpload(meta);

      // 2) Upload file to storage (presigned URL) with progress
      setUploadStage("put");
      await uploadWithProgress(init.url, f, meta.mime, setProgress);

      // 3) Finalize so API creates DB row and enqueues jobs
      setUploadStage("finalize");
      const fin = await finalizeSignedUpload({
        path: init.path,
        filename: meta.filename,
        mime: meta.mime,
        size: meta.size,
        profileLabel: meta.profileLabel,
        companyTag: meta.companyTag,
      } as any);

      setResult(fin);
      setProgress(100);

      // 4) Wait briefly for processing so the user knows what is happening
      if (fin?.jobId) {
        try {
          setUploadStage("processing");
          setMsg("Upload complete. Processing call…");
          await waitForJob(fin.jobId, 20000);
        } catch (e: any) {
          setLastErrorStage("processing");
          setUploadStage("error");
          setMsg(friendlyUploadError("processing", e));
          return;
        }
      }

      setUploadStage("done");
      setMsg("Uploaded ✓");
    } catch (e: any) {
      const stage =
        uploadStage === "put"
          ? "put"
          : uploadStage === "finalize"
            ? "finalize"
            : "init";

      setLastErrorStage(stage);
      setUploadStage("error");
      setMsg(friendlyUploadError(stage, e));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    if (!cleanProfileLabel) {
      setMsg("Please add a rep / client profile name before uploading.");
      return;
    }

    // client-side guardrails
    if (file.size > MAX_FILE_BYTES) {
      setMsg(`File too large: ${(file.size / 1024 / 1024).toFixed(1)}MB (max 100MB)`);
      return;
    }
    setLastFile(file);
    await doUpload(file);
  }

  return (
    <div className="mx-auto w-full max-w-4xl p-8 space-y-6">
      <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Upload a Call</h1>
            <p className="mt-1 text-sm text-neutral-400">
              Keep uploads organised by adding a profile name first. Company / tag is optional but recommended.
            </p>
          </div>
          <Link href="/recent-calls" className="underline text-sm">Recent calls</Link>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <div className="text-sm font-medium">Profile / Rep / Client name <span className="text-red-300">*</span></div>
            <input
              type="text"
              value={profileLabel}
              onChange={(e) => setProfileLabel(e.target.value)}
              placeholder="e.g. Julius Segantini, Nike SDR Team, Barclays Lead"
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none"
            />
            <div className="text-xs text-neutral-500">Required. This keeps uploaded calls grouped and searchable.</div>
          </label>

          <label className="space-y-2">
            <div className="text-sm font-medium">Company / Tag</div>
            <input
              type="text"
              value={companyTag}
              onChange={(e) => setCompanyTag(e.target.value)}
              placeholder="e.g. Gravix, Demo Batch 1, Client A"
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none"
            />
            <div className="text-xs text-neutral-500">Optional. Use this for company, campaign, or batch labelling.</div>
          </label>
        </div>

        <div
          className="rounded-2xl border border-dashed border-neutral-700 bg-neutral-950 p-6 text-sm"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) { setFile(f); setLastFile(f); }
          }}
        >
          <div className="text-sm text-neutral-300">Drag & drop an audio file here, or choose one below.</div>
          <div className="mt-1 text-xs text-neutral-500">Supports audio files and transcript JSON. Max 100MB.</div>
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
              {fileTooLarge && (
                <span className="ml-2 text-red-300">(too large, max 100MB)</span>
              )}
            </div>
          )}
        </div>
        {!cleanProfileLabel && (
          <div className="text-xs text-amber-300">
            Add a profile / rep / client name before uploading.
          </div>
        )}

        {/* Progress bar (shows only while uploading) */}
        {busy && (
          <div className="w-full h-2 bg-zinc-700 rounded overflow-hidden">
            <div className="h-2 bg-white/70 transition-all" style={{ width: `${progress}%` }} />
          </div>
        )}
        {busy && (
          <div className="text-xs text-neutral-400">
            {uploadStage === "init" && "Starting upload…"}
            {uploadStage === "put" && "Uploading file to storage…"}
            {uploadStage === "finalize" && "Creating call record…"}
            {uploadStage === "processing" && `Processing call${jobStatus ? ` (${jobStatus})` : "…"}`}
          </div>
        )}

        <button
          type="submit"
          disabled={!canUpload}
          className="border rounded px-3 py-1 text-sm disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Upload"}
        </button>
        {lastFile && !busy && lastErrorStage && cleanProfileLabel && (
          <button
            type="button"
            onClick={() => doUpload(lastFile)}
            className="ml-2 border rounded px-3 py-1 text-sm"
          >
            Retry {lastErrorStage}
          </button>
        )}

        {msg && (
          <div
            className={`text-sm ${
              uploadStage === "done"
                ? "text-green-300"
                : uploadStage === "processing"
                  ? "text-amber-300"
                  : uploadStage === "error"
                    ? "text-red-300"
                    : "text-neutral-300"
            }`}
          >
            {msg}
          </div>
        )}
      </form>

      {result?.ok && (
        <div className="rounded-xl border p-4 space-y-2">
          <div className="text-sm opacity-80">
            Profile: <span className="font-mono">{cleanProfileLabel}</span>
          </div>
          {cleanCompanyTag ? (
            <div className="text-sm opacity-80">
              Company / Tag: <span className="font-mono">{cleanCompanyTag}</span>
            </div>
          ) : null}
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