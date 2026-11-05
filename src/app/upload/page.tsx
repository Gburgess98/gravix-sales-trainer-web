"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { PageShell, PageHead, Panel, dsButton, dsField } from "@/components/ds";
import {
  signedInitUpload,
  finalizeSignedUpload,
  getJobStatus,
  getCallStatus,
  listUploadAccounts,
  proxyFetch,
  type UploadAccountOption,
} from "@/lib/api";
import {
  ACCEPTED_TYPES_LABEL,
  FILE_INPUT_ACCEPT,
  MAX_SIZE_LABEL,
  PENDING_KEY,
  RUN_STAGES,
  callIdFromPath,
  describeFailure,
  formatBytes,
  missingForUpload,
  parsePending,
  serializePending,
  stageAnnouncement,
  stageStatus,
  validateRecording,
  type Failure,
  type RunStage,
} from "@/lib/upload-model";

type View = "form" | "running" | "done" | "failed";
type Outcome = "scored" | "processed" | "pending";

/** Everything that must survive a retry without creating a second call. */
type Session = {
  init: { path: string; url: string } | null;
  uploaded: boolean;
  finalizeTried: boolean;
  finalized: { callId: string; jobId: string | null } | null;
  filename: string;
};
const freshSession = (): Session => ({ init: null, uploaded: false, finalizeTried: false, finalized: null, filename: "" });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function putFile(url: string, file: File, contentType: string, onProgress: (pct: number) => void) {
  const xhr = new XMLHttpRequest();
  const done = new Promise<void>((resolve, reject) => {
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("Content-Type", contentType || "application/octet-stream");
    xhr.upload.onprogress = (evt) => {
      if (!evt.lengthComputable) return;
      onProgress(Math.min(100, Math.max(0, Math.round((evt.loaded / evt.total) * 100))));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`storage ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("network"));
    xhr.onabort = () => reject(new Error("cancelled"));
    xhr.send(file);
  });
  return { done, abort: () => xhr.abort() };
}

export default function UploadPage() {
  // ── form ──
  const [file, setFile] = useState<File | null>(null);
  const [fileProblem, setFileProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [accounts, setAccounts] = useState<UploadAccountOption[]>([]);
  const [accountId, setAccountId] = useState("");

  // ── run ──
  const [view, setView] = useState<View>("form");
  const [stage, setStage] = useState<RunStage>("preparing");
  const [progress, setProgress] = useState(0);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [failedAt, setFailedAt] = useState<RunStage | null>(null);
  const [outcome, setOutcome] = useState<Outcome>("pending");
  const [announce, setAnnounce] = useState("");
  const [isManager, setIsManager] = useState(false);
  const [resumed, setResumed] = useState(false);

  const session = useRef<Session>(freshSession());
  const aborter = useRef<(() => void) | null>(null);
  const cancelled = useRef(false);
  const alive = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const resumeChecked = useRef(false);

  const missing = missingForUpload({ hasFile: !!file });
  const canUpload = view === "form" && !!file && !fileProblem && missing.length === 0;
  const activeUpload = view === "running" && stage !== "processing";

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      aborter.current?.();
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const a = await listUploadAccounts();
      if (!active) return;
      setAccounts(a);
    })();
    return () => { active = false; };
  }, []);

  // Move focus to the new heading when the view changes, so keyboard and screen-reader users land on the result.
  useEffect(() => {
    if (view !== "form") headingRef.current?.focus();
  }, [view]);

  // Leave guard while the recording is still travelling (nothing is saved until finalising completes). Covers tab close and
  // reload (beforeunload), in-app links, and browser Back. Back cannot be intercepted without a history entry, so ONE
  // sentinel entry is pushed when the transfer starts and removed again when it stops being active: history depth is the
  // same before and after, Staying re-arms exactly one entry (no growth, no loop), and once processing is resumable the
  // guard is gone so Back leaves normally (a refresh resumes the call).
  const router = useRouter();
  const guardArmed = useRef(false);
  const ignorePop = useRef(false);
  const popWaiter = useRef<(() => void) | null>(null);
  const leaving = useRef(false);

  const armGuard = useCallback(() => {
    if (guardArmed.current) return;
    // Keep Next's own history state so its popstate handler restores this page instead of reloading.
    window.history.pushState({ ...(window.history.state ?? {}), gravixUploadGuard: true }, "", window.location.href);
    guardArmed.current = true;
  }, []);

  /** Remove the sentinel entry (silently) and resolve once the browser has popped it. */
  const disarmGuard = useCallback(() => {
    if (!guardArmed.current) return Promise.resolve();
    guardArmed.current = false;
    return new Promise<void>((resolve) => {
      ignorePop.current = true;
      popWaiter.current = resolve;
      window.history.back();
      setTimeout(() => { if (popWaiter.current === resolve) { ignorePop.current = false; popWaiter.current = null; resolve(); } }, 1000);
    });
  }, []);

  useEffect(() => {
    if (!activeUpload) return;
    leaving.current = false;
    armGuard();
    const MESSAGE = "Your upload is still in progress. If you leave now it will be cancelled.";
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (a.origin !== window.location.origin) return;
      e.preventDefault();
      e.stopPropagation();
      if (!window.confirm(MESSAGE)) return;
      leaving.current = true;
      // Drop the sentinel first so the destination does not stack a duplicate entry for this page.
      void disarmGuard().then(() => router.push(`${a.pathname}${a.search}${a.hash}`));
    };
    const onPopState = () => {
      if (ignorePop.current) {
        ignorePop.current = false;
        popWaiter.current?.();
        popWaiter.current = null;
        return;
      }
      if (!guardArmed.current) return;
      guardArmed.current = false; // Back consumed the sentinel; we are on this page's real entry now
      if (window.confirm(MESSAGE)) {
        leaving.current = true;
        window.removeEventListener("beforeunload", onBeforeUnload); // already confirmed: no second, browser-level prompt
        window.history.back(); // one more step: to the page before this one
      } else {
        armGuard(); // stay: re-arm exactly one entry
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("popstate", onPopState);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onClick, true);
      // Transfer ended (finalised, failed, cancelled): remove the sentinel. Not on unmount — the user is already leaving.
      if (alive.current && !leaving.current) void disarmGuard();
    };
  }, [activeUpload, armGuard, disarmGuard, router]);

  // ── file selection ──
  function acceptFile(f: File | null | undefined) {
    if (!f) return;
    const problem = validateRecording(f);
    if (problem) {
      setFileProblem(problem.message); // an invalid pick never replaces a valid selection
      return;
    }
    setFileProblem(null);
    setFile(f);
    session.current = freshSession(); // a different file is a different upload
  }

  function removeFile() {
    setFile(null);
    setFileProblem(null);
    session.current = freshSession();
    if (inputRef.current) inputRef.current.value = "";
  }

  // ── pipeline ──
  const go = useCallback((s: RunStage, pct = 0) => {
    setStage(s);
    setAnnounce(stageAnnouncement(s, pct));
  }, []);

  function persistPending(callId: string, jobId: string | null, filename: string) {
    try {
      window.sessionStorage.setItem(PENDING_KEY, serializePending({ callId, jobId, filename, at: Date.now() }));
    } catch { /* storage unavailable — resume is a convenience only */ }
  }
  function clearPending() {
    try { window.sessionStorage.removeItem(PENDING_KEY); } catch { /* ignore */ }
  }

  /** Poll the transcribe job, then the call, for a bounded window. Throws only on a real processing failure. */
  async function pollProcessing(callId: string, jobId: string | null, maxMs = 30000): Promise<Outcome> {
    const started = Date.now();
    let jobDone = !jobId;
    let blips = 0;
    while (alive.current && Date.now() - started < maxMs) {
      try {
        if (!jobDone && jobId) {
          const j = await getJobStatus(jobId);
          const status = String(j?.status || j?.job?.status || "");
          if (status === "succeeded") jobDone = true;
          else if (status === "failed") throw new Error("processing_failed");
        } else {
          const { status } = await getCallStatus(callId);
          if (status === "scored") return "scored";
          if (status === "failed" || status === "error") throw new Error("processing_failed");
        }
        blips = 0;
      } catch (e) {
        if (String((e as Error)?.message) === "processing_failed") throw e;
        if (++blips >= 3) throw e; // a few transient errors are tolerated; a persistent one is real
      }
      await sleep(1500);
    }
    return jobDone ? "processed" : "pending";
  }

  async function settle() {
    const fin = session.current.finalized;
    if (!fin) return;
    go("processing");
    setView("running");
    try {
      const result = await pollProcessing(fin.callId, fin.jobId);
      if (!alive.current) return;
      if (result === "pending") {
        setOutcome("pending");
        setAnnounce("Call uploaded. Processing has started and is still running.");
      } else {
        clearPending();
        setOutcome(result);
        setAnnounce(result === "scored" ? "Call ready for review." : "Call uploaded. Scoring is still running.");
      }
      void probeManager();
      setView("done");
    } catch (e) {
      if (!alive.current) return;
      clearPending();
      fail("processing", e);
    }
  }

  function fail(at: RunStage, e: unknown) {
    const f = describeFailure(at, e);
    setFailure(f);
    setFailedAt(at);
    setAnnounce(`${f.title}. ${f.detail}`);
    setView("failed");
  }

  async function probeManager() {
    try {
      const res = await proxyFetch("/v1/admin/config", { cache: "no-store" });
      if (alive.current) setIsManager(res.ok);
    } catch { /* fail closed: no manager-only link */ }
  }

  async function run() {
    const f = file;
    if (!f) return;
    const s = session.current;
    cancelled.current = false;
    setFailure(null);
    setFailedAt(null);
    setView("running");
    let at: RunStage = "preparing";
    try {
      if (!s.finalized) {
        const mime = f.type || "application/octet-stream";
        s.filename = f.name;

        if (!s.uploaded) {
          at = "preparing";
          go(at);
          setProgress(0);
          s.init = await signedInitUpload({ filename: f.name, mime, size: f.size });
          if (cancelled.current) return;

          at = "uploading";
          go(at, 0);
          let lastQuarter = 0;
          const up = putFile(s.init.url, f, mime, (pct) => {
            setProgress(pct);
            const q = Math.floor(pct / 25);
            if (q > lastQuarter) { lastQuarter = q; setAnnounce(stageAnnouncement("uploading", pct)); }
          });
          aborter.current = up.abort;
          await up.done;
          aborter.current = null;
          s.uploaded = true;
          setProgress(100);
        }

        at = "finalising";
        go(at);
        const init = s.init!;
        // Duplicate guard: if an earlier finalise reached the server (the response was lost), the call already exists
        // under the id derived from the storage path — adopt it instead of creating a second one.
        if (s.finalizeTried) {
          try {
            const existing = await getCallStatus(callIdFromPath(init.path));
            if (existing.status) s.finalized = { callId: callIdFromPath(init.path), jobId: null };
          } catch { /* not found — safe to finalise */ }
        }
        if (!s.finalized) {
          s.finalizeTried = true;
          const fin = await finalizeSignedUpload({
            path: init.path,
            filename: f.name,
            mime,
            size: f.size,
            accountId: accountId || null,
          });
          s.finalized = { callId: fin.callId, jobId: fin.jobId ?? null };
        }
        persistPending(s.finalized.callId, s.finalized.jobId, f.name);
      }
      await settle();
    } catch (e) {
      aborter.current = null;
      if (!alive.current) return;
      if (cancelled.current || String((e as Error)?.message) === "cancelled") {
        s.init = null; // a cancelled transfer is discarded; nothing was saved
        s.uploaded = false;
        setView("form");
        setAnnounce("Upload cancelled. Nothing was saved.");
        return;
      }
      fail(at, e);
    }
  }

  function cancelUpload() {
    cancelled.current = true;
    aborter.current?.();
  }

  function retry() {
    if (failedAt === "processing") void settle();
    else void run();
  }

  function startNew() {
    clearPending();
    session.current = freshSession();
    setFile(null);
    setFileProblem(null);
    setProgress(0);
    setFailure(null);
    setFailedAt(null);
    setResumed(false);
    setView("form");
    if (inputRef.current) inputRef.current.value = "";
  }

  function backToForm() {
    // Keep the chosen file and answers; discard any unfinished transfer (nothing is saved until finalising completes).
    if (!session.current.finalized) session.current = freshSession();
    setFailure(null);
    setFailedAt(null);
    setView("form");
  }

  // Refresh or return during processing: pick the call up where it was.
  useEffect(() => {
    if (resumeChecked.current) return;
    resumeChecked.current = true;
    let raw: string | null = null;
    try { raw = window.sessionStorage.getItem(PENDING_KEY); } catch { /* ignore */ }
    const p = parsePending(raw);
    if (!p) { if (raw) clearPending(); return; }
    session.current = { ...freshSession(), uploaded: true, finalizeTried: true, finalized: { callId: p.callId, jobId: p.jobId }, filename: p.filename };
    setResumed(true);
    void settle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── render ──
  const savedName = session.current.filename || file?.name || "your recording";
  const finalizedCallId = session.current.finalized?.callId ?? null;
  const currentForList: RunStage | "completed" | "failed" = view === "failed" ? "failed" : view === "done" && outcome !== "pending" ? "completed" : stage;

  return (
    <PageShell narrow>
      <PageHead
        title="Upload a call"
        subtitle="Add a recording. Gravix transcribes and scores it, then it appears in Calls."
        actions={<Link href="/call-library?tab=upload" className={dsButton("quiet", "md")}>Upload history</Link>}
      />

      {/* One polite announcer for the whole workflow; failures also use role="alert" in their own view. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">{announce}</div>

      {view === "form" && (
        <form
          onSubmit={(e) => { e.preventDefault(); if (canUpload) void run(); }}
          aria-label="Upload a call"
          noValidate
        >
          <Panel className="divide-y divide-[var(--ds-border)]">
            {/* 1 — recording */}
            <section className="space-y-3 p-5 sm:p-6" aria-labelledby="up-file-h">
              <div>
                <h2 id="up-file-h" className="text-base font-semibold text-[var(--ds-text)]">Recording</h2>
                <p id="up-file-help" className="mt-0.5 text-sm text-[var(--ds-text-3)]">
                  {ACCEPTED_TYPES_LABEL}. Up to {MAX_SIZE_LABEL} per file.
                </p>
              </div>

              <input
                ref={inputRef}
                type="file"
                hidden
                accept={FILE_INPUT_ACCEPT}
                data-testid="upload-input"
                onChange={(e) => { acceptFile(e.target.files?.[0]); e.target.value = ""; }}
              />

              {file ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--ds-radius-control)] border border-[var(--ds-border)] bg-white/[0.03] px-4 py-3" data-testid="upload-selected">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--ds-text)]" title={file.name}>{file.name}</p>
                    <p className="text-xs text-[var(--ds-text-3)]">{formatBytes(file.size)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className={dsButton("secondary", "sm")} onClick={() => inputRef.current?.click()} aria-label={`Replace ${file.name}`}>Replace</button>
                    <button type="button" className={dsButton("quiet", "sm")} onClick={removeFile} aria-label={`Remove ${file.name}`}>Remove</button>
                  </div>
                </div>
              ) : (
                <div
                  data-testid="upload-dropzone"
                  onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
                  onDrop={(e) => { e.preventDefault(); setDragging(false); acceptFile(e.dataTransfer.files?.[0]); }}
                  className={clsx(
                    "flex flex-col items-center gap-3 rounded-[var(--ds-radius-card)] border border-dashed px-5 py-10 text-center transition-colors motion-reduce:transition-none",
                    dragging ? "border-[var(--ds-highlight)] bg-white/[0.07]" : "border-[var(--ds-border-strong)] bg-white/[0.02]",
                  )}
                >
                  <p className="text-sm text-[var(--ds-text-2)]">{dragging ? "Drop to select this file" : "Drag a recording here"}</p>
                  <button
                    type="button"
                    className={dsButton("secondary", "md")}
                    onClick={() => inputRef.current?.click()}
                    aria-describedby={clsx("up-file-help", fileProblem && "up-file-error")}
                  >
                    Choose a file
                  </button>
                </div>
              )}

              {fileProblem && (
                <p id="up-file-error" role="alert" className="text-sm text-red-200" data-testid="upload-file-error">{fileProblem}</p>
              )}
            </section>

            {/* 2 — optional client account (the one optional field the API honours: it is stored as the call's account) */}
            {accounts.length > 0 && (
              <section className="space-y-2 p-5 sm:p-6" aria-labelledby="up-acct-h">
                <h2 id="up-acct-h" className="text-base font-semibold text-[var(--ds-text)]">Client account <span className="text-sm font-normal text-[var(--ds-text-3)]">(optional)</span></h2>
                <label htmlFor="up-account" className="sr-only">Link this call to a client account</label>
                <select id="up-account" value={accountId} onChange={(e) => setAccountId(e.target.value)} className={dsField}>
                  <option value="">No account</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <p className="text-xs text-[var(--ds-text-3)]">
                  Client not listed?{" "}
                  <Link href="/crm/accounts" target="_blank" rel="noopener" className="text-[var(--ds-highlight)] underline-offset-2 hover:underline">Create new client</Link>
                  {" "}(opens in a new tab).
                </p>
              </section>
            )}

            {/* 3 — ownership and visibility (separate ideas), then submit */}
            <section className="space-y-4 p-5 sm:p-6" aria-labelledby="up-vis-h">
              <div>
                <h2 className="text-base font-semibold text-[var(--ds-text)]">Who owns this call</h2>
                <p className="mt-1 text-sm text-[var(--ds-text-2)]" data-testid="upload-ownership">The call will belong to you, the signed-in uploader.</p>
              </div>
              <div>
                <h2 id="up-vis-h" className="text-base font-semibold text-[var(--ds-text)]">Who can see this call</h2>
                <p className="mt-1 text-sm leading-relaxed text-[var(--ds-text-2)]" data-testid="upload-visibility">
                  You can always open calls you upload. Other people in your organisation can open it according to your organisation’s
                  call-visibility setting (everyone, managers only, or nobody else). People outside your organisation never can.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button type="submit" disabled={!canUpload} aria-describedby="up-needs" className={dsButton("primary", "md")}>Upload call</button>
                <Link href="/call-library" className={dsButton("quiet", "md")}>Back to Calls</Link>
              </div>
              <p id="up-needs" className="text-xs text-[var(--ds-text-3)]" data-testid="upload-needs">
                {missing.length > 0 ? `To upload, add ${missing.join(" and ")}.` : fileProblem ? "Choose a supported file to continue." : "Ready to upload."}
              </p>
            </section>
          </Panel>

          <p className="mt-4 px-1 text-sm text-[var(--ds-text-3)]">
            What happens next: once the file is uploaded, Gravix transcribes and scores it in the background. The time varies, so you can leave
            this page after it says the call is uploaded. Managers can then review it and assign coaching.
          </p>
        </form>
      )}

      {view !== "form" && (
        <Panel className="p-5 sm:p-6" as="section">
          <div className="space-y-5" aria-live="off">
            <div>
              <h2
                ref={headingRef}
                tabIndex={-1}
                className="text-lg font-semibold text-[var(--ds-text)] outline-none"
                data-testid="upload-heading"
              >
                {view === "running" && (resumed && stage === "processing" ? "Checking on your upload" : stage === "processing" ? "Processing the call" : "Uploading your call")}
                {view === "failed" && (failure?.title ?? "Something went wrong")}
                {view === "done" && (outcome === "scored" ? "Call ready for review." : "Call uploaded. Processing has started.")}
              </h2>
              <p className="mt-0.5 truncate text-sm text-[var(--ds-text-3)]" title={savedName}>
                {savedName}{file && session.current.filename === file.name ? ` · ${formatBytes(file.size)}` : ""}
              </p>
            </div>

            <ol className="space-y-2" aria-label="Upload progress">
              {RUN_STAGES.map((s) => {
                const st = stageStatus(s.id, currentForList, failedAt);
                return (
                  <li key={s.id} aria-current={st === "current" ? "step" : undefined} className="flex items-center gap-3 text-sm">
                    <span
                      aria-hidden="true"
                      className={clsx(
                        "inline-block size-2.5 rounded-full",
                        st === "done" && "bg-emerald-400",
                        st === "current" && "bg-[var(--ds-highlight)] motion-safe:animate-pulse",
                        st === "failed" && "bg-red-400",
                        st === "upcoming" && "bg-white/20",
                      )}
                    />
                    <span className={clsx(st === "upcoming" ? "text-[var(--ds-text-3)]" : "text-[var(--ds-text)]")}>{s.label}</span>
                    <span className="sr-only">{st === "done" ? "complete" : st === "current" ? "in progress" : st === "failed" ? "failed" : "waiting"}</span>
                  </li>
                );
              })}
            </ol>

            {view === "running" && stage === "uploading" && (
              <div className="space-y-1.5">
                <progress max={100} value={progress} aria-label="Upload progress" className="h-2 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-white/10 [&::-webkit-progress-value]:bg-[var(--ds-primary)] [&::-moz-progress-bar]:bg-[var(--ds-primary)]" />
                <p className="text-xs tabular-nums text-[var(--ds-text-3)]" data-testid="upload-percent">{progress}% uploaded</p>
              </div>
            )}

            {view === "running" && stage !== "processing" && (
              <p className="text-sm text-[var(--ds-text-2)]">Keep this page open until the upload finishes. Leaving now will cancel it.</p>
            )}
            {view === "running" && stage === "processing" && (
              <p className="text-sm text-[var(--ds-text-2)]">
                Your recording is saved. Gravix is transcribing and scoring it. This runs in the background and can take a few minutes — you can leave this page.
              </p>
            )}

            {view === "failed" && failure && (
              <div role="alert" className="rounded-[var(--ds-radius-control)] border border-red-300/20 bg-red-400/[0.06] px-4 py-3 text-sm text-red-100">
                {failure.detail}
              </div>
            )}

            {view === "done" && (
              <p className="text-sm text-[var(--ds-text-2)]">
                {outcome === "scored"
                  ? "Scoring has finished. Open the call to read the transcript and score."
                  : outcome === "processed"
                    ? "Transcription is done and scoring is still running. It will appear scored in Calls when it finishes."
                    : "It’s still processing, which can take a few minutes. You can leave this page — the call will show its status under Uploads in Calls."}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {view === "running" && stage === "uploading" && (
                <button type="button" className={dsButton("secondary", "md")} onClick={cancelUpload}>Cancel upload</button>
              )}

              {view === "failed" && (
                <>
                  <button type="button" className={dsButton("primary", "md")} onClick={retry}>
                    {failedAt === "processing" ? "Check again" : "Try again"}
                  </button>
                  {failure?.saved ? (
                    <Link href="/call-library?tab=upload" className={dsButton("secondary", "md")}>See uploads in Calls</Link>
                  ) : (
                    <button type="button" className={dsButton("secondary", "md")} onClick={backToForm}>Edit details</button>
                  )}
                  {failure?.saved ? (
                    <button type="button" className={dsButton("quiet", "md")} onClick={startNew}>Upload a different call</button>
                  ) : (
                    <button type="button" className={dsButton("quiet", "md")} onClick={startNew}>Start over</button>
                  )}
                </>
              )}

              {view === "done" && (
                <>
                  {finalizedCallId && (
                    <Link href={`/calls/${finalizedCallId}`} className={dsButton("primary", "md")}>View call</Link>
                  )}
                  {outcome === "pending" && (
                    <button type="button" className={dsButton("secondary", "md")} onClick={() => void settle()}>Check again</button>
                  )}
                  <Link href="/call-library" className={dsButton("secondary", "md")}>Back to Calls</Link>
                  {isManager && outcome === "scored" && (
                    <Link href="/coaching?tab=review" className={dsButton("secondary", "md")}>Open Review Queue</Link>
                  )}
                  <button type="button" className={dsButton("quiet", "md")} onClick={startNew}>Upload another</button>
                </>
              )}

              {view === "running" && stage === "processing" && (
                <Link href="/call-library?tab=upload" className={dsButton("quiet", "md")}>Leave and check later</Link>
              )}
            </div>
          </div>
        </Panel>
      )}
    </PageShell>
  );
}
