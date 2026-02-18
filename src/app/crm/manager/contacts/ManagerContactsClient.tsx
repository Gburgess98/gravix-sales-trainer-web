// src/app/crm/manager/contacts/ManagerContactsClient.tsx
"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type Health = {
  score?: number;
  band?: string;
  reasons?: string[];
  stats?: {
    open_actions?: number;
    overdue_actions?: number;
    last_contacted_days?: number;
    has_notes?: boolean;
    has_recent_call?: boolean;
  };
};

type ActionCounts = {
  open?: number;
  overdue?: number;
  completed?: number;
};

type ContactRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  company?: string | null;
  created_at?: string | null;
  last_contacted_at?: string | null;
  health?: Health | null;
  action_counts?: ActionCounts | null;
};

function n(v: any) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function fmtName(r: ContactRow) {
  const a = String(r.first_name ?? "").trim();
  const b = String(r.last_name ?? "").trim();
  const name = `${a} ${b}`.trim();
  return name || "—";
}

function bandPill(band?: string | null) {
  const b = String(band ?? "").trim().toLowerCase();
  if (!b) return { label: "—", cls: "bg-neutral-900 text-neutral-300 border-neutral-800" };
  if (b === "good") return { label: "Good", cls: "bg-green-950 text-green-200 border-green-900" };
  if (b === "watch") return { label: "Watch", cls: "bg-amber-950 text-amber-200 border-amber-900" };
  if (b === "risk") return { label: "Risk", cls: "bg-red-950 text-red-200 border-red-900" };
  return { label: band!, cls: "bg-neutral-900 text-neutral-300 border-neutral-800" };
}

function scoreCls(score: number) {
  if (score >= 80) return "text-green-300";
  if (score >= 60) return "text-amber-200";
  return "text-red-300";
}

export default function ManagerContactsClient(props: {
  initialFilter: "all" | "at-risk";
  initialLimit: number;
  initialOk: boolean;
  initialError: string | null;
  initialItems: ContactRow[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [items] = useState<ContactRow[]>(props.initialItems ?? []);
  const ok = props.initialOk;
  const error = props.initialError;

  const currentFilter = useMemo(() => {
    const f = sp.get("filter");
    return f === "at-risk" ? "at-risk" : props.initialFilter;
  }, [sp, props.initialFilter]);

  const setFilter = (next: "all" | "at-risk") => {
    const qs = new URLSearchParams(sp.toString());
    if (next === "at-risk") qs.set("filter", "at-risk");
    else qs.delete("filter");
    if (!qs.get("limit")) qs.set("limit", String(props.initialLimit ?? 50));

    startTransition(() => {
      router.push(`${pathname}?${qs.toString()}`);
      router.refresh(); // re-fetch server list
    });
  };

  const derived = useMemo(() => {
    // Extra safety: if API ever returns unsorted, we still put worst up top.
    const list = [...(items ?? [])];

    return list.sort((a, b) => {
      const ao = n(a.health?.stats?.overdue_actions ?? a.action_counts?.overdue);
      const bo = n(b.health?.stats?.overdue_actions ?? b.action_counts?.overdue);
      if (bo !== ao) return bo - ao;

      const as = n(a.health?.score);
      const bs = n(b.health?.score);
      if (as !== bs) return as - bs;

      const ald = n(a.health?.stats?.last_contacted_days);
      const bld = n(b.health?.stats?.last_contacted_days);
      if (bld !== ald) return bld - ald;

      const ac = Date.parse(String(a.created_at ?? "")) || 0;
      const bc = Date.parse(String(b.created_at ?? "")) || 0;
      return bc - ac;
    });
  }, [items]);

  return (
    <div>
      {/* Tabs */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setFilter("all")}
          className={[
            "px-3 py-2 rounded border text-sm",
            currentFilter === "all"
              ? "border-neutral-700 bg-neutral-900 text-neutral-100"
              : "border-neutral-800 text-neutral-300 hover:bg-neutral-900",
          ].join(" ")}
          disabled={isPending}
        >
          All
        </button>
        <button
          onClick={() => setFilter("at-risk")}
          className={[
            "px-3 py-2 rounded border text-sm",
            currentFilter === "at-risk"
              ? "border-amber-800 bg-amber-950 text-amber-200"
              : "border-neutral-800 text-neutral-300 hover:bg-neutral-900",
          ].join(" ")}
          disabled={isPending}
        >
          At risk
        </button>

        <div className="ml-auto text-xs text-neutral-500">
          {isPending ? "Refreshing…" : `Rows: ${derived.length}`}
        </div>
      </div>

      {/* Error / empty */}
      <div className="mt-4">
        {!ok ? (
          <div className="p-3 rounded border border-red-900 bg-red-950 text-red-200 text-sm">
            Failed to load manager contacts: <span className="text-red-100">{error ?? "unknown_error"}</span>
          </div>
        ) : derived.length === 0 ? (
          <div className="p-3 rounded border border-neutral-800 bg-neutral-950 text-neutral-300 text-sm">
            No contacts found.
          </div>
        ) : (
          <div className="overflow-x-auto rounded border border-neutral-800">
            <table className="min-w-full text-sm">
              <thead className="bg-neutral-950">
                <tr className="text-neutral-300">
                  <th className="py-2 px-3 text-left font-medium">Contact</th>
                  <th className="py-2 px-3 text-left font-medium">Company</th>
                  <th className="py-2 px-3 text-right font-medium">Overdue</th>
                  <th className="py-2 px-3 text-right font-medium">Open</th>
                  <th className="py-2 px-3 text-right font-medium">Health</th>
                  <th className="py-2 px-3 text-left font-medium">Band</th>
                  <th className="py-2 px-3 text-right font-medium">Last contact (d)</th>
                  <th className="py-2 px-3 text-left font-medium">Reason</th>
                  <th className="py-2 px-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-900">
                {derived.map((r) => {
                  const overdue = n(r.health?.stats?.overdue_actions ?? r.action_counts?.overdue);
                  const open = n(r.health?.stats?.open_actions ?? r.action_counts?.open);
                  const score = n(r.health?.score);
                  const lastDays = n(r.health?.stats?.last_contacted_days);
                  const reason = (r.health?.reasons ?? [])[0] ?? "";
                  const pill = bandPill(r.health?.band ?? null);

                  const dot =
                    overdue > 0 ? "bg-red-500" : score < 60 ? "bg-amber-400" : "bg-neutral-700";

                  return (
                    <tr
                      key={r.id}
                      className="bg-neutral-950/30 hover:bg-neutral-900/40 cursor-pointer"
                      onClick={() => router.push(`/crm/contacts/${encodeURIComponent(r.id)}`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/crm/contacts/${encodeURIComponent(r.id)}`);
                        }
                      }}
                    >
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
                          <Link
                            href={`/crm/contacts/${encodeURIComponent(r.id)}`}
                            className="text-neutral-100 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {fmtName(r)}
                          </Link>
                        </div>
                        <div className="text-xs text-neutral-500">{r.email ?? "—"}</div>
                      </td>

                      <td className="py-2 px-3 text-neutral-200">{r.company ?? "—"}</td>

                      <td className="py-2 px-3 text-right">
                        <span className={overdue > 0 ? "text-red-300 font-medium" : "text-neutral-300"}>
                          {overdue}
                        </span>
                      </td>

                      <td className="py-2 px-3 text-right text-neutral-200">{open}</td>

                      <td className="py-2 px-3 text-right">
                        <span className={`font-medium ${scoreCls(score)}`}>{score || 0}</span>
                      </td>

                      <td className="py-2 px-3">
                        <span className={`inline-flex items-center px-2 py-1 rounded border text-xs ${pill.cls}`}>
                          {pill.label}
                        </span>
                      </td>

                      <td className="py-2 px-3 text-right text-neutral-200">{lastDays || 0}</td>

                      <td className="py-2 px-3 text-neutral-300">
                        <span className="text-neutral-400">{reason ? String(reason) : "—"}</span>
                      </td>

                      <td className="py-2 px-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <Link
                            href={`/crm/contacts/${encodeURIComponent(r.id)}`}
                            onClick={(e) => e.stopPropagation()}
                            className="px-2 py-1 rounded border border-neutral-800 bg-neutral-950 text-neutral-200 text-xs hover:bg-neutral-900"
                            title="Open contact"
                          >
                            Open
                          </Link>

                          <a
                            href={r.email ? `mailto:${r.email}` : undefined}
                            onClick={(e) => e.stopPropagation()}
                            className={[
                              "px-2 py-1 rounded border text-xs",
                              r.email
                                ? "border-neutral-800 bg-neutral-950 text-neutral-200 hover:bg-neutral-900"
                                : "border-neutral-900 bg-neutral-950 text-neutral-600 cursor-not-allowed",
                            ].join(" ")}
                            title={r.email ? "Email contact" : "No email on file"}
                            aria-disabled={!r.email}
                            onMouseDown={(e) => {
                              // Prevent row focus/selection when clicking disabled state
                              if (!r.email) e.preventDefault();
                            }}
                          >
                            Email
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="mt-3 text-xs text-neutral-500">
        Source: <span className="text-neutral-400">/v1/crm/manager/contacts</span> · Filter{" "}
        <span className="text-neutral-400">{currentFilter}</span>
      </div>
    </div>
  );
}