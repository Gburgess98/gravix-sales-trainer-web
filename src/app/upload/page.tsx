"use client";

import { useState } from "react";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");

  // Resolve target from env (we expect this to be the direct API URL now)
  const base = (process.env.NEXT_PUBLIC_API_URL || "/api/proxy").replace(/\/$/, "");
  const target = `${base}/v1/upload`;

  async function onUpload() {
    if (!file) {
      setStatus("error");
      setMessage("Pick a file first");
      return;
    }

    setStatus("uploading");
    setMessage("");

    try {
      const fd = new FormData();
      fd.append("file", file);

      const r = await fetch(target, {
        method: "POST",
        body: fd,
        headers: { "x-user-id": process.env.NEXT_PUBLIC_TEST_UID || "" } as any,
      });

      let j: any = null;
      let raw = "";
      try {
        j = await r.clone().json();
      } catch {
        raw = await r.text().catch(() => "");
      }

      console.log("[upload] resp", { ok: r.ok, status: r.status, json: j, raw });

      if (!r.ok || !j?.ok) {
        setStatus("error");
        setMessage(j?.error || raw || `HTTP ${r.status}`);
        return;
      }

      setStatus("ok");
      setMessage(`Uploaded: ${j.callId}`);
    } catch (e: any) {
      console.error("[upload] fetch error", e);
      setStatus("error");
      setMessage(e?.message || "Upload failed");
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-8">
      <h1 className="text-2xl font-semibold mb-2">Upload a call</h1>
      <p className="text-xs opacity-70 mb-6">
        Target: <code className="opacity-90">{target}</code>
      </p>

      <div className="flex items-center gap-3">
        <input
          type="file"
          accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button
          onClick={onUpload}
          className="px-4 py-2 rounded bg-white/10 hover:bg-white/20 border border-white/30"
          disabled={status === "uploading"}
        >
          {status === "uploading" ? "Uploading…" : "Upload"}
        </button>
      </div>

      <div className="mt-4 text-sm">
        <span className="opacity-70">Status:</span>{" "}
        <span className={status === "error" ? "text-red-500" : "text-green-400"}>{status}</span>
        <div className="mt-1 opacity-80 break-all">{message || "(no message yet)"}</div>
      </div>
    </div>
  );
}