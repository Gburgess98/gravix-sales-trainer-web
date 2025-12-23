"use client";

import { useEffect, useMemo, useState } from "react";

type WhispererTurn = {
  id: string;
  session_id: string;
  role: "user" | "assistant";
  text: string;
  created_at: string;
};

type WhispererPanelProps = {
  personaId?: string | null;
  turns: WhispererTurn[];
  disabled?: boolean;
};

// Small helper: in dev on localhost, hit the API directly;
// otherwise use the Next.js proxy route.
function getWhispererUrl() {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://localhost:4000/v1/whisperer/preview";
    }
  }
  return "/api/proxy/v1/whisperer/preview";
}

export function WhispererPanel({
  personaId,
  turns,
  disabled,
}: WhispererPanelProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Normalise the transcript into buyer/rep roles for the API
  const transcriptPayload = useMemo(
    () =>
      turns
        .filter((t) => (t.text || "").trim().length > 0)
        .map((t) => ({
          role: t.role === "assistant" ? "buyer" : "rep",
          text: t.text || "",
        })),
    [turns],
  );

  useEffect(() => {
    if (disabled) return;

    // No convo yet – nothing to suggest
    if (!transcriptPayload.length) {
      setSuggestions([]);
      setError(null);
      return;
    }

    // Persona is required, but don’t clear existing suggestions if it’s briefly null
    if (!personaId) {
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const url = getWhispererUrl();
        console.log("[WhispererPanel] calling", url, {
          personaId,
          transcriptLen: transcriptPayload.length,
        });

        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({
            personaId,
            transcript: transcriptPayload,
          }),
        });

        if (cancelled) return;

        const text = await res.text();
        let data: any = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch (e) {
          console.warn("[WhispererPanel] non-JSON response", text);
        }

        console.log("[WhispererPanel] preview raw response", { status: res.status, data });

        if (!res.ok) {
          const msg =
            (data && (data.error || data.message)) ||
            `HTTP ${res.status}: ${text || "Failed to load suggestions"}`;
          setError(msg);
          setSuggestions([]);
          return;
        }

        if (data && data.ok === false) {
          setError(data.error || "Failed to load suggestions.");
          setSuggestions([]);
          return;
        }

        const arr = Array.isArray(data?.suggestions)
          ? (data.suggestions as string[])
          : [];

        if (!arr.length) {
          // Explicit “no suggestions” state instead of silently vanishing
          setSuggestions([]);
          setError(
            "No live prompts yet — try pushing harder on price, ROI, or objections.",
          );
          return;
        }

        setSuggestions(arr);
        setError(null);
      } catch (e: any) {
        if (cancelled) return;
        console.error("[WhispererPanel] preview failed", e);
        setError(e?.message || "Failed to load suggestions.");
        setSuggestions([]);
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [personaId, transcriptPayload, disabled]);

  // If round is ended, just show the “ended” copy
  if (disabled) {
    return (
      <div className="flex h-full flex-col rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs animate-in fade-in-0 duration-200">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[11px] font-medium text-neutral-100">
            Whisperer suggestions
          </div>
        </div>
        <p className="text-[11px] text-neutral-500">
          Round ended — replay this drill to get new suggestions.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs animate-in fade-in-0 duration-200">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-medium text-neutral-100">
          Whisperer suggestions
        </div>
        {loading && (
          <span className="text-[10px] text-neutral-500">Analysing…</span>
        )}
      </div>

      {!loading && !suggestions.length && !error && (
        <p className="text-[11px] text-neutral-500">
          Start the conversation and we&apos;ll surface live coaching prompts
          here.
        </p>
      )}

      {!loading && error && (
        <p className="text-[11px] text-red-400 whitespace-pre-wrap">
          {error}
        </p>
      )}

      {!loading && suggestions.length > 0 && (
        <ul className="mt-1 space-y-2">
          {suggestions.slice(0, 4).map((s, idx) => (
            <li
              key={idx}
              className="rounded-md border border-neutral-800 bg-neutral-900 px-2 py-2"
            >
              <p className="text-[11px] text-neutral-100 whitespace-pre-wrap">
                {s}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}