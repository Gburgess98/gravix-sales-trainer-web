"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type CrmContact = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  name?: string | null;
  email?: string | null;
  company?: string | null;
  last_contacted_at?: string | null;
};

type CrmAccount = {
  id?: string | null;
  name?: string | null;
};

type ContactGetResponse = {
  ok: boolean;
  contact?: CrmContact;
  account?: CrmAccount | null;
  error?: string;
};

type ContactHealth = {
  status: "cold" | "warm" | "hot" | string;
  score: number;
  reasons?: string[];
};

function fmtAbsolute(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function fmtRelative(iso?: string | null) {
  if (!iso) return "Never";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Never";

  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const absSec = Math.abs(diffSec);

  // Future timestamps (clock skew) -> show absolute.
  if (diffSec < 0) return fmtAbsolute(iso);

  if (absSec < 60) return "Just now";
  const mins = Math.floor(absSec / 60);
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 6) return `${weeks} week${weeks === 1 ? "" : "s"} ago`;

  // After ~6 weeks, absolute is more useful.
  return fmtAbsolute(iso);
}

function toTitleCase(s: string) {
  return s
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      const lower = w.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

function initials(name: string) {
  const parts = name
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  const a = parts[0]?.[0] || "?";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
  return (a + b).toUpperCase();
}

export default function ContactHeaderClient({
  contactId,
  health,
}: {
  contactId: string;
  health?: ContactHealth | null;
}) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [contact, setContact] = useState<CrmContact | null>(null);
  const [account, setAccount] = useState<CrmAccount | null>(null);
  const [copied, setCopied] = useState(false);

  const router = useRouter();
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const r = await fetch(`/api/proxy/v1/crm/contacts/${contactId}`, {
          method: "GET",
          cache: "no-store",
          headers: { accept: "application/json" },
        });

        const res = (await r.json()) as ContactGetResponse;

        if (!alive) return;

        if (!res?.ok) {
          setErr(res?.error || "Failed to load contact");
          setContact(null);
          setAccount(null);
          return;
        }

        setContact(res.contact || null);
        setAccount(res.account || null);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message || "Failed to load contact");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [contactId]);

  if (loading) {
    return (
      <div className="rounded-xl border border-neutral-900 bg-neutral-950 p-4 text-sm text-neutral-400">
        Loading contact…
      </div>
    );
  }

  if (err) {
    return (
      <div className="rounded-xl border border-red-900/40 bg-red-950/20 p-4">
        <div className="text-sm font-semibold text-red-300">Couldn’t load contact</div>
        <div className="mt-1 text-sm text-red-200/80">{typeof err === "string" ? err : (err as any)?.label ?? (err as any)?.message ?? (() => { try { return JSON.stringify(err); } catch { return String(err); } })()}</div>
        <div className="mt-3 text-sm">
          <Link href="/crm/overview" className="text-neutral-200 underline">
            Back to CRM
          </Link>
        </div>
      </div>
    );
  }

  const rawName =
    String(contact?.name ?? "").trim() ||
    [contact?.first_name, contact?.last_name]
      .filter((v) => v != null && String(v).trim() !== "")
      .map((v) => String(v))
      .join(" ") ||
    "(Unnamed)";

  const fullName = rawName === "(Unnamed)" ? rawName : toTitleCase(String(rawName));

  const email = String(contact?.email ?? "").trim();
  const accountId = account?.id ? String(account.id) : null;
  const companyName = String(account?.name ?? contact?.company ?? "—");

  const lastContactedRelative = fmtRelative(contact?.last_contacted_at);
  const lastContactedAbsolute = contact?.last_contacted_at
    ? fmtAbsolute(contact?.last_contacted_at)
    : "Never";

  const avatar = initials(fullName);

  async function copyEmail() {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }

  async function handleMarkContacted() {
    if (!contactId || marking) return;

    try {
      setMarking(true);

      const res = await fetch(
        `/api/proxy/v1/crm/contacts/${encodeURIComponent(contactId)}/mark-contacted`,
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
          },
          cache: "no-store",
        }
      );

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        console.error("mark_contacted_failed", json);
        return;
      }

      // Optimistic UI: update the header immediately, then refresh server data.
      const last = String(json?.last_contacted_at ?? "").trim();
      if (last) {
        setContact((prev) => (prev ? { ...prev, last_contacted_at: last } : prev));
      }

      router.refresh();
    } catch (err) {
      console.error("mark_contacted_error", err);
    } finally {
      setMarking(false);
    }
  }

  const healthStatus = (health?.status || "cold").toLowerCase();
  const healthScore = typeof health?.score === "number" ? health!.score : null;

  const healthPriority =
    healthScore == null
      ? null
      : healthScore >= 70
      ? "High"
      : healthScore >= 40
      ? "Medium"
      : "Low";

  function priorityPill() {
    const base =
      "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold";
    if (healthPriority === "High") {
      return {
        cls: `${base} border-red-800/60 bg-red-950/30 text-red-200`,
        label: "High priority",
      };
    }
    if (healthPriority === "Medium") {
      return {
        cls: `${base} border-amber-800/60 bg-amber-950/25 text-amber-200`,
        label: "Medium priority",
      };
    }
    return {
      cls: `${base} border-neutral-800 bg-neutral-950 text-neutral-300`,
      label: "Low priority",
    };
  }

  const pp = healthPriority ? priorityPill() : null;

  function healthPill() {
    const base = "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold";

    if (healthStatus === "hot") {
      return { cls: `${base} border-emerald-800/60 bg-emerald-950/30 text-emerald-200`, label: "Hot" };
    }
    if (healthStatus === "warm") {
      return { cls: `${base} border-amber-800/60 bg-amber-950/25 text-amber-200`, label: "Warm" };
    }
    return { cls: `${base} border-sky-900/50 bg-sky-950/20 text-sky-200`, label: "Cold" };
  }

  const hp = healthPill();
  const healthTitle = health?.reasons?.length
    ? `${healthStatus.toUpperCase()} • ${healthScore ?? "—"}/100\n${health.reasons.join("\n")}`
    : `${healthStatus.toUpperCase()} • ${healthScore ?? "—"}/100`;

  return (
    <div className="rounded-2xl border border-neutral-900 bg-neutral-950/80 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950 text-sm font-semibold text-neutral-200">
            {avatar}
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">CRM Contact</div>

              <span className="inline-flex items-center rounded-full border border-neutral-800 bg-neutral-950 px-2 py-0.5 text-[11px] font-semibold text-neutral-300">
                {contactId}
              </span>

              {/* Health */}
              <span className={hp.cls} title={healthTitle}>
                {hp.label}
                {healthScore != null ? (
                  <span className="ml-1 text-[11px] font-semibold text-neutral-200/90">{healthScore}</span>
                ) : null}
              </span>
              {pp ? (
                <span className={pp.cls} title={`Priority derived from score (${healthScore}/100)`}>
                  {pp.label}
                </span>
              ) : null}
            </div>

            <div className="mt-1 text-2xl font-semibold tracking-tight text-neutral-100">{fullName}</div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-neutral-300">
              <div className="flex items-center gap-2">
                <span className="text-neutral-500">Email</span>
                {email ? (
                  <a className="text-neutral-200 hover:text-white underline underline-offset-4" href={`mailto:${email}`}>
                    {String(email)}
                  </a>
                ) : (
                  <span className="text-neutral-500">—</span>
                )}
              </div>

              <div className="h-4 w-px bg-neutral-900" />

              <div className="flex items-center gap-2">
                <span className="text-neutral-500">Company</span>
                {accountId ? (
                  <Link
                    href={`/crm/accounts/${accountId}`}
                    className="text-neutral-200 hover:text-white underline underline-offset-4"
                    title="Open account"
                  >
                    {String(companyName)}
                  </Link>
                ) : companyName && companyName !== "—" ? (
                  <span className="text-neutral-200">{String(companyName)}</span>
                ) : (
                  <span className="text-neutral-500">—</span>
                )}
              </div>

              <div className="h-4 w-px bg-neutral-900" />

              <div className="flex items-center gap-2">
                <span className="text-neutral-500">Last contacted</span>
                <span className="text-neutral-200" title={lastContactedAbsolute}>
                  {lastContactedRelative}
                </span>
                {!health && lastContactedRelative === "Never" ? (
                  <span className="inline-flex items-center rounded-full border border-neutral-800 bg-neutral-950 px-2 py-0.5 text-[11px] font-semibold text-neutral-400">
                    Never contacted
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
          <Link
            href="/crm/overview"
            className="inline-flex h-9 items-center rounded-xl border border-neutral-800/80 bg-neutral-950 px-3 text-sm font-semibold text-neutral-200 hover:bg-neutral-900/70 hover:border-neutral-700 transition-all duration-150 active:scale-[0.98]"
          >
            Back to CRM
          </Link>

          <button
            type="button"
            onClick={copyEmail}
            disabled={!email}
            className="inline-flex h-9 items-center rounded-xl border border-neutral-800/80 bg-neutral-950 px-3 text-sm font-semibold text-neutral-200 hover:bg-neutral-900/70 hover:border-neutral-700 transition-all duration-150 active:scale-[0.98] disabled:opacity-40"
          >
            {copied ? "Copied ✓" : "Copy email"}
          </button>

          <a
            href={email ? `mailto:${email}` : "#"}
            className="inline-flex h-9 items-center rounded-xl bg-white px-3 text-sm font-semibold text-black hover:bg-neutral-100 transition-all duration-150 active:scale-[0.98] disabled:opacity-40"
            aria-disabled={!email}
            onClick={(e) => {
              if (!email) e.preventDefault();
            }}
          >
            Email
          </a>
          <button
            type="button"
            onClick={handleMarkContacted}
            disabled={marking}
            className="inline-flex h-9 items-center rounded-xl border border-neutral-800/80 bg-neutral-950 px-3 text-sm font-semibold text-neutral-200 hover:bg-neutral-900/70 hover:border-neutral-700 transition-all duration-150 active:scale-[0.98] disabled:opacity-40"
          >
            {marking ? "Marking…" : "Mark contacted"}
          </button>
        </div>
      </div>
    </div>
  );
}