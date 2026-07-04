"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  signedInitUpload,
  finalizeSignedUpload,
  getJobStatus,
  getCallStatus,
  listTeamUsers,
  listUploadAccounts,
  type UploadRepOption,
  type UploadAccountOption,
} from "@/lib/api";

const MAX_FILE_BYTES = 100 * 1024 * 1024; // 100MB client-side guardrail

const CALL_TYPES = ["Discovery", "Objection", "Closing", "Follow-up", "Other"] as const;

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
  const [companyText, setCompanyText] = useState(""); // free-text account/company when no CRM accounts exist
  const [companyTag, setCompanyTag] = useState(""); // tag / campaign label
  const [callType, setCallType] = useState("");

  // Day 162 — structured linking (fail-soft; free text still works if these are empty).
  const [reps, setReps] = useState<UploadRepOption[]>([]);
  const [accounts, setAccounts] = useState<UploadAccountOption[]>([]);
  const [repId, setRepId] = useState("");
  const [accountId, setAccountId] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);
  const [progress, setProgress] = useState<number>(0);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [uploadStage, setUploadStage] = useState<"idle" | "init" | "put" | "finalize" | "processing" | "done" | "error">("idle");
  const [lastErrorStage, setLastErrorStage] = useState<null | "init" | "put" | "finalize" | "processing">(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [processingReason, setProcessingReason] = useState<string | null>(null);
  const [reviewReady, setReviewReady] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const [r, a] = await Promise.all([listTeamUsers(), listUploadAccounts()]);
      if (!active) return;
      setReps(r);
      setAccounts(a);
    })();
    return () => { active = false; };
  }, []);

  const cleanProfileLabel = useMemo(() => profileLabel.trim(), [profileLabel]);
  // Single free-text label for grouping/logging: combine the free-text company
  // (used only when no CRM accounts exist) with the tag/campaign label.
  const combinedCompanyTag = useMemo(
    () => [companyText.trim(), companyTag.trim()].filter(Boolean).join(" · "),
    [companyText, companyTag]
  );
  const fileTooLarge = !!file && file.size > MAX_FILE_BYTES;
  const canUpload = !!file && !busy && !fileTooLarge && cleanProfileLabel.length > 0;

  function onSelectRep(id: string) {
    setRepId(id);
    const rep = reps.find((x) => x.id === id);
    if (rep) setProfileLabel(rep.name);
  }

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
      // Day 164 — poll through the authenticated proxy helper so job polling
      // carries the same user context as init/finalize (a raw fetch had no
      // auth headers, so the proxy returned missing_user).
      const j: any = await getJobStatus(jobId);
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

  // Day 165 — after transcription the call is "processed"; scoring runs next and
  // only when the call reaches "scored" does it enter the manager Review Queue.
  // Poll the call status so we can honestly say "ready for review" vs "processing".
  async function waitForScored(callId: string, maxMs = 20000) {
    const started = Date.now();
    while (Date.now() - started < maxMs) {
      try {
        const { status } = await getCallStatus(callId);
        if (status) setJobStatus(status);
        if (status === "scored") return true;
        if (status === "failed" || status === "error") return false;
      } catch {
        // transient — the row may still be settling; keep polling
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    return false;
  }

  async function doUpload(f: File) {
    setBusy(true);
    setMsg(null);
    setResult(null);
    setProgress(0);
    setJobStatus(null);
    setLastErrorStage(null);
    setProcessingReason(null);
    setReviewReady(false);
    setUploadStage("init");

    try {
      const meta = {
        filename: f.name,
        mime: f.type || "application/octet-stream",
        size: f.size,
        profileLabel: cleanProfileLabel,
        companyTag: combinedCompanyTag || null,
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
        accountId: accountId || null,
        callType: callType || null,
      });

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
          setProcessingReason(String(e?.message || "unknown"));
          setMsg(null);
          return;
        }
      }

      setUploadStage("done");
      setMsg(null);

      // Processing continues (scoring) after the transcribe job — poll the call
      // so the success screen can flip to "ready for review" once it is scored.
      if (fin?.callId) {
        const scored = await waitForScored(fin.callId, 20000);
        setReviewReady(scored);
      }
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
      setMsg("Please choose or type a rep before uploading.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setMsg(`File too large: ${formatMB(file.size)} (max 100MB)`);
      return;
    }
    setLastFile(file);
    await doUpload(file);
  }

  function resetForAnother() {
    setFile(null);
    setLastFile(null);
    setResult(null);
    setMsg(null);
    setProgress(0);
    setUploadStage("idle");
    setJobStatus(null);
    setProcessingReason(null);
    setReviewReady(false);
  }

  const fieldClass = "w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-600";

  return (
    <div className="mx-auto w-full max-w-5xl p-6 space-y-4">
      {/* Header */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.12em] text-neutral-500">Calls</p>
        <h1 className="mt-0.5 text-xl font-semibold text-white">Upload a sales call</h1>
        <p className="mt-0.5 text-sm text-neutral-400">
          Link the recording to the right client, rep and review queue.
        </p>
      </div>

      {/* Two-column on desktop: form on the left, calm guidance on the right so the
          page uses the available width instead of floating in the centre. */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left column — form / success */}
        <div className="lg:col-span-2">
      {/* Success state */}
      {uploadStage === "done" && result?.ok ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-3">
          <div>
            {reviewReady ? (
              <>
                <h2 className="text-base font-semibold text-emerald-200">Call ready for review.</h2>
                <p className="mt-0.5 text-sm text-neutral-300">
                  Scoring finished — open the Review Queue to score, spot weak skills and assign coaching.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-base font-semibold text-emerald-200">Call uploaded. Processing has started.</h2>
                <p className="mt-0.5 text-sm text-neutral-300">
                  It will appear in the Review Queue once scoring finishes. This can take a few minutes{jobStatus ? ` — currently ${jobStatus}` : ""}.
                </p>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/coaching?tab=review"
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400"
            >
              Open Review Queue
            </Link>
            <Link
              href="/coaching"
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-3.5 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-600 hover:text-white"
            >
              Open Manager Command Centre
            </Link>
            {result.callId && (
              <Link
                href={`/calls/${result.callId}`}
                className="rounded-lg border border-neutral-700 bg-neutral-900 px-3.5 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-600 hover:text-white"
              >
                View call
              </Link>
            )}
            <button
              type="button"
              onClick={resetForAnother}
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-3.5 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-600 hover:text-white"
            >
              Upload another
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {/* Single compact card holds all three groups so the form fits without zooming out. */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5 space-y-5">
            {/* Group — call ownership */}
            <div className="space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Call ownership</div>
              <div className="grid gap-4 md:grid-cols-2">
                {/* Account / Company */}
                <label className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-neutral-200">Account / Company</span>
                    <Link
                      href="/crm/accounts"
                      target="_blank"
                      className="text-[11px] font-medium text-indigo-300 hover:text-indigo-200"
                    >
                      Create new client
                    </Link>
                  </div>
                  {accounts.length > 0 && (
                    <select
                      value={accountId}
                      onChange={(e) => setAccountId(e.target.value)}
                      className={fieldClass}
                    >
                      <option value="">Select an account…</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  )}
                  {(accounts.length === 0 || !accountId) && (
                    <input
                      type="text"
                      value={companyText}
                      onChange={(e) => setCompanyText(e.target.value)}
                      placeholder="e.g. Nike, Barclays, Demo Batch 1"
                      className={fieldClass}
                    />
                  )}
                  <div className="text-[11px] text-neutral-500">Client not listed? Add a temporary label{accounts.length > 0 ? " below" : ""}.</div>
                </label>

                {/* Rep */}
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-neutral-200">Rep <span className="text-red-300">*</span></span>
                  {reps.length > 0 && (
                    <select
                      value={repId}
                      onChange={(e) => onSelectRep(e.target.value)}
                      className={fieldClass}
                    >
                      <option value="">Choose a rep…</option>
                      {reps.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  )}
                  <input
                    type="text"
                    value={profileLabel}
                    onChange={(e) => setProfileLabel(e.target.value)}
                    placeholder="Rep or client name"
                    className={fieldClass}
                  />
                  <div className="text-[11px] text-neutral-500">Free text still works for quick demos.</div>
                </label>
              </div>
            </div>

            {/* Group — call context */}
            <div className="space-y-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Call context</div>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-neutral-200">Call type</span>
                  <select
                    value={callType}
                    onChange={(e) => setCallType(e.target.value)}
                    className={fieldClass}
                  >
                    <option value="">Optional</option>
                    {CALL_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5">
                  <span className="text-sm font-medium text-neutral-200">Tag / Campaign</span>
                  <input
                    type="text"
                    value={companyTag}
                    onChange={(e) => setCompanyTag(e.target.value)}
                    placeholder="e.g. Q3 outbound"
                    className={fieldClass}
                  />
                </label>
              </div>
            </div>

            {/* Group — recording */}
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Recording</div>
              <div
                className="rounded-xl border border-dashed border-neutral-700 bg-neutral-950 px-4 py-3 text-sm"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) { setFile(f); setLastFile(f); }
                }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="file"
                    accept="audio/*,.wav,.mp3,.m4a,.webm,.json"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setFile(f);
                      if (f) setLastFile(f);
                    }}
                    className="block text-sm"
                  />
                  <span className="text-[11px] text-neutral-600">or drag &amp; drop · audio or JSON · max 100MB</span>
                </div>
                {file && (
                  <div className="mt-1.5 text-xs text-neutral-400">
                    Selected: <span className="font-mono">{file.name}</span> ({formatMB(file.size)})
                    {fileTooLarge && <span className="ml-2 text-red-300">(too large, max 100MB)</span>}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Progress */}
          {busy && (
            <div className="space-y-1">
              <div className="w-full h-2 bg-neutral-800 rounded overflow-hidden">
                <div className="h-2 bg-indigo-400 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="text-xs text-neutral-400">
                {uploadStage === "init" && "Starting upload…"}
                {uploadStage === "put" && "Uploading file to storage…"}
                {uploadStage === "finalize" && "Creating call record…"}
                {uploadStage === "processing" && `Processing call${jobStatus ? ` (${jobStatus})` : "…"}`}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!canUpload}
              className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-400 disabled:opacity-50"
            >
              {busy ? "Uploading…" : "Upload and send to review queue"}
            </button>
            <Link
              href="/coaching"
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-3.5 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-600 hover:text-white"
            >
              Back to Command Centre
            </Link>
            {lastFile && !busy && lastErrorStage && cleanProfileLabel && (
              <button
                type="button"
                onClick={() => doUpload(lastFile)}
                className="rounded-lg border border-neutral-700 bg-neutral-900 px-3.5 py-2 text-sm font-medium text-neutral-200 transition-colors hover:border-neutral-600 hover:text-white"
              >
                Retry {lastErrorStage}
              </button>
            )}
          </div>

          {!cleanProfileLabel && (
            <div className="text-xs text-amber-300">Choose or type a rep before uploading.</div>
          )}

          {uploadStage === "error" && lastErrorStage === "processing" && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-200">
              <div>Call uploaded, but processing could not start.</div>
              <div className="mt-0.5 text-xs text-neutral-400">Reason: {processingReason || "unknown"}</div>
            </div>
          )}

          {msg && (
            <div
              className={`text-sm ${
                uploadStage === "processing"
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
      )}
        </div>

        {/* Right column — calm guidance, uses the desktop width instead of empty space */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">What happens next</h2>
            <ol className="mt-3 space-y-2.5">
              {[
                "We upload the recording",
                "Gravix sends it to the review queue",
                "The manager reviews score, weak skills and coaching actions",
              ].map((step, i) => (
                <li key={step} className="flex gap-2.5 text-neutral-300">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-neutral-700 text-[11px] text-neutral-400">{i + 1}</span>
                  <span className="text-[13px] leading-5">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-5">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Need a new client?</h2>
            <Link
              href="/crm/accounts"
              target="_blank"
              className="mt-2 inline-block rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-[13px] font-medium text-neutral-200 transition-colors hover:border-neutral-600 hover:text-white"
            >
              Create new client
            </Link>
            <p className="mt-2 text-[12px] text-neutral-500">Opens Accounts in a new tab so your upload stays here.</p>
          </div>

        </aside>
      </div>
    </div>
  );
}
