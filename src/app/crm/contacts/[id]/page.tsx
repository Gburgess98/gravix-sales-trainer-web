import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import ContactHeaderClient from "./ContactHeaderClient";
import ContactAssignmentsClient from "./ContactAssignmentsClient";
import RepNotesClient from "./RepNotesClient";
import AIBriefClient from "./AIBriefClient";

async function autoAssign(formData: FormData) {
  "use server";

  const contactId = String(formData.get("contactId") || "").trim();
  const dryRun = String(formData.get("dryRun") || "") === "1";
  if (!contactId) return;

  await fetch(
    `${process.env.INTERNAL_API_BASE_URL ?? "http://localhost:3000"}/api/proxy/v1/crm/contacts/${encodeURIComponent(
      contactId
    )}/auto-assign`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(dryRun ? { dry_run: true } : {}),
      cache: "no-store",
    }
  );

  if (!dryRun) {
    redirect(`/crm/contacts/${encodeURIComponent(contactId)}?autoAssigned=1`);
  }
}

export default async function ContactPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const p = await params;
  const sp = searchParams ? await searchParams : undefined;
  const contactId = p.id;

  const base = process.env.INTERNAL_API_BASE_URL ?? "http://localhost:3000";

  // Fetch contact (and health) server-side
  let health: any = null;
  try {
    const h = await headers();
    const res = await fetch(
      `${base}/api/proxy/v1/crm/contacts/${encodeURIComponent(contactId)}`,
      {
        headers: {
          // NOTE: proxy attaches auth; keep this header for legacy/dev support
          "x-user-id": h.get("x-user-id") ?? "",
        },
        cache: "no-store",
      }
    );
    const json = await res.json();
    if (res.ok && json?.ok) {
      // schema-tolerant: API may return `health` top-level or nested
      health = json.health ?? json.contact?.health ?? null;
    }
  } catch {
    // non-blocking
  }

  // Fetch contact actions (server-side)
  let actions: { open: any[]; completed: any[] } | null = null;
  try {
    const h = await headers();
    const res = await fetch(
      `${base}/api/proxy/v1/crm/contacts/${encodeURIComponent(contactId)}/actions?limit=50`,
      {
        headers: {
          "x-user-id": h.get("x-user-id") ?? "",
        },
        cache: "no-store",
      }
    );
    const json = await res.json();
    if (res.ok && json?.ok) {
      actions = {
        open: json.open ?? [],
        completed: json.completed ?? [],
      };
    }
  } catch {
    // non-blocking
  }

  // Fetch contact activity (server-side)
  let activity: any[] = [];
  try {
    const h = await headers();
    const res = await fetch(
      `${base}/api/proxy/v1/crm/contacts/${encodeURIComponent(contactId)}/activity?limit=25`,
      {
        headers: {
          "x-user-id": h.get("x-user-id") ?? "",
        },
        cache: "no-store",
      }
    );
    const json = await res.json();
    if (res.ok && json?.ok) {
      activity = Array.isArray(json.items) ? json.items : [];
    }
  } catch {
    // non-blocking
  }

  const fmtRel = (iso?: string | null) => {
    if (!iso) return "—";
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return "—";
    const diffMs = Date.now() - t;
    const s = Math.max(0, Math.floor(diffMs / 1000));
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ago`;
    if (h > 0) return `${h}h ago`;
    if (m > 0) return `${m}m ago`;
    return `${s}s ago`;
  };

  const iconFor = (kind: "call" | "note" | "action" | "other") => {
    if (kind === "call") return "📞";
    if (kind === "note") return "📝";
    if (kind === "action") return "✅";
    return "•";
  };

  const activityKind = (it: any): "call" | "note" | "action" | "other" => {
    const t = String(it?.type ?? "").toLowerCase();
    if (t.includes("call")) return "call";
    if (t.includes("note")) return "note";
    if (t.includes("action")) return "action";

    // Heuristics if upstream types vary
    if (it?.call_id || it?.callId || it?.duration_s || it?.durationSec || it?.recording_url) return "call";
    if (it?.note_id || it?.noteId || it?.body) return "note";
    if (it?.action_id || it?.actionId || it?.due_at || it?.dueAt) return "action";

    return "other";
  };

  const activityTypeLabel = (kind: "call" | "note" | "action" | "other") => {
    if (kind === "call") return "CALL";
    if (kind === "note") return "NOTE";
    if (kind === "action") return "ACTION";
    return "EVENT";
  };

  const metaString = (x: any) => {
    if (x == null) return "";
    if (typeof x === "string") return x;
    if (typeof x === "number" || typeof x === "boolean") return String(x);
    if (typeof x === "object") {
      const lbl = (x as any).label ?? (x as any).message ?? (x as any).type;
      if (lbl != null && String(lbl).trim()) return String(lbl);
      try {
        return JSON.stringify(x);
      } catch {
        return String(x);
      }
    }
    return String(x);
  };

  const cleanTitleForActivity = (it: any, kind: "call" | "note" | "action" | "other") => {
    const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

    if (kind === "note") {
      const body = metaString(it?.body ?? it?.title ?? it?.summary ?? it?.name);
      return oneLine(body) || "(note)";
    }

    if (kind === "action") {
      const title = metaString(it?.title ?? it?.label ?? it?.summary ?? it?.name);
      return oneLine(title) || "(action)";
    }

    if (kind === "call") {
      const title = metaString(it?.title ?? it?.summary ?? it?.name);
      return oneLine(title) || "Call";
    }

    const title = metaString(it?.title ?? it?.summary ?? it?.name);
    return oneLine(title) || "(event)";
  };

  const fmtDuration = (secs: number) => {
    const s = Math.max(0, Math.floor(secs));
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m <= 0) return `${r}s`;
    return `${m}m ${r.toString().padStart(2, "0")}s`;
  };

  const reasonText = (r: any) => {
    if (r == null) return "";
    if (typeof r === "string") return r;
    if (typeof r === "number" || typeof r === "boolean") return String(r);
    if (typeof r === "object") {
      // Prefer common label fields; fall back to JSON
      const lbl = (r as any).label ?? (r as any).message ?? (r as any).type;
      if (lbl != null && String(lbl).trim()) return String(lbl);
      try {
        return JSON.stringify(r);
      } catch {
        return String(r);
      }
    }
    return String(r);
  };

  const nextActionText = (x: any) => {
    if (x == null) return "";
    if (typeof x === "string") return x;
    if (typeof x === "number" || typeof x === "boolean") return String(x);
    if (typeof x === "object") {
      const lbl = (x as any).label ?? (x as any).message ?? (x as any).type;
      if (lbl != null && String(lbl).trim()) return String(lbl);
      try {
        return JSON.stringify(x);
      } catch {
        return String(x);
      }
    }
    return String(x);
  };

  const bandRaw = String((health as any)?.band ?? (health as any)?.status ?? "").toLowerCase();
  const band = bandRaw === "hot" || bandRaw === "warm" || bandRaw === "watch" ? bandRaw : health ? "watch" : "";

  const bandPillClass =
    band === "hot"
      ? "bg-green-500/15 text-green-400"
      : band === "warm"
        ? "bg-yellow-500/15 text-yellow-400"
        : "bg-red-500/15 text-red-400";

  const bandDotClass = band === "hot" ? "bg-green-400" : band === "warm" ? "bg-yellow-400" : "bg-red-400";
  const bandTitle = band === "hot" ? "HOT" : band === "warm" ? "WARM" : band ? "WATCH" : "";

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-8">
      {(sp as any)?.autoAssigned === "1" ? (
        <div className="rounded-lg border border-green-800 bg-green-900/20 px-4 py-2 text-sm text-green-300">
          ✓ Action auto-assigned successfully
        </div>
      ) : null}

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">CRM · Contact</h1>
          <p className="text-sm text-neutral-400">Relationship context, activity, and coaching signals.</p>
        </div>

        <Link href="/crm/overview" className="text-sm text-neutral-400 hover:text-neutral-200 underline">
          ← Back to CRM
        </Link>
      </div>

      {/* Contact header */}
      <ContactHeaderClient contactId={contactId} health={health} />

      {health ? (
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${bandDotClass}`} />
                <div className="text-sm font-semibold text-neutral-200">Contact Health</div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${bandPillClass}`}>{bandTitle}</span>
                <span className="text-[11px] text-neutral-500">Score: {Number((health as any)?.score ?? 0)}</span>
              </div>

              <div className="mt-2 text-sm text-neutral-200">
                <span className="text-neutral-400">Next:</span>{" "}
                {nextActionText((health as any)?.next_action) || "No next action yet."}
              </div>

              {(health as any)?.reasons?.length ? (
                <div className="mt-1 text-xs text-neutral-500">
                  {Array.isArray((health as any).reasons)
                    ? (health as any).reasons.map(reasonText).filter(Boolean).slice(0, 2).join(" • ")
                    : ""}
                </div>
              ) : null}
            </div>

            <div className="shrink-0 text-right">
              <div className="text-[11px] text-neutral-500">Last contacted</div>
              <div className="mt-1 text-xs font-semibold text-neutral-200">
                {(health as any)?.stats?.last_contacted_days == null ? "Never" : `${Number((health as any).stats.last_contacted_days)}d`}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {health ? (
        <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-neutral-200">Contact Health</h2>
              <p className="text-xs text-neutral-500">Overall relationship status and urgency.</p>
            </div>

            <div className="flex items-center gap-2">
              <span className={["rounded-full px-3 py-1 text-xs font-semibold", bandPillClass].join(" ")}>{bandTitle}</span>

              <span className="text-xs text-neutral-400">Score: {Number((health as any)?.score ?? 0)}</span>
            </div>
          </div>

          {health.reasons?.length ? (
            <ul className="mt-3 list-disc pl-5 text-xs text-neutral-400 space-y-1">
              {health.reasons.map((r: any, i: number) => {
                const t = reasonText(r) || `Reason ${i + 1}`;
                return <li key={`${i}-${t}`}>{t}</li>;
              })}
            </ul>
          ) : null}

          {(health as any)?.next_action ? (
            <div className="mt-3 text-xs text-neutral-300">
              <span className="font-semibold">Suggested next step:</span> {nextActionText((health as any)?.next_action) || "—"}
            </div>
          ) : null}

          {/* Next Action block (health-driven priorities) */}
          <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-neutral-200">Next Action</div>
                <div className="mt-1 text-sm text-neutral-200">{nextActionText((health as any)?.next_action) || "No next action yet."}</div>
              </div>

              <div className="shrink-0 text-right">
                <div className="text-[11px] text-neutral-500">Why</div>
                <div className="mt-1 text-xs text-neutral-400">
                  {health.reasons?.length ? health.reasons.map(reasonText).filter(Boolean).slice(0, 2).join(" • ") : "—"}
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-md border border-neutral-800 bg-neutral-950 p-2">
                <div className="text-[11px] text-neutral-500">Overdue</div>
                <div className="text-xs font-semibold text-neutral-200">{health.signals?.overdue_assignments ?? 0}</div>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950 p-2">
                <div className="text-[11px] text-neutral-500">Critical notes</div>
                <div className="text-xs font-semibold text-neutral-200">{health.signals?.critical_notes ?? 0}</div>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950 p-2">
                <div className="text-[11px] text-neutral-500">Important notes</div>
                <div className="text-xs font-semibold text-neutral-200">{health.signals?.important_notes ?? 0}</div>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950 p-2">
                <div className="text-[11px] text-neutral-500">Last contacted</div>
                <div className="text-xs font-semibold text-neutral-200">
                  {health.signals?.last_contacted_days == null ? "Never" : `${health.signals.last_contacted_days}d`}
                </div>
              </div>
            </div>

            <form action={autoAssign} className="mt-3 flex gap-2">
              <input type="hidden" name="contactId" value={contactId} />

              <button
                type="submit"
                name="dryRun"
                value="1"
                className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-300 hover:bg-neutral-800"
              >
                Preview auto-assign
              </button>

              <button
                type="submit"
                className="rounded-md bg-indigo-600/20 px-3 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-600/30"
              >
                Auto-assign this action
              </button>
            </form>
          </div>
        </section>
      ) : null}

      {/* Context row */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-neutral-200">Recent Activity</h2>
              <p className="text-xs text-neutral-500">Calls, notes, and actions linked to this contact.</p>
            </div>
            <div className="text-xs text-neutral-500">{activity.length ? `${activity.length} items` : ""}</div>
          </div>

          {activity.length ? (
            <ul className="mt-3 space-y-2">
              {activity.slice(0, 25).map((it: any, idx: number) => {
                const created = (it as any)?.created_at ?? (it as any)?.at ?? null;

                const kind = activityKind(it);
                const typeLabel = activityTypeLabel(kind);

                // Prefer explicit meta object if present, otherwise fall back to item itself
                const metaObj = (it as any)?.meta && typeof (it as any).meta === "object" ? (it as any).meta : null;

                const title = cleanTitleForActivity(it, kind);

                const completedAt =
                  (it as any)?.completed_at ??
                  (it as any)?.completedAt ??
                  metaObj?.completed_at ??
                  metaObj?.completedAt ??
                  null;

                const dueAt =
                  (it as any)?.due_at ??
                  (it as any)?.dueAt ??
                  metaObj?.due_at ??
                  metaObj?.dueAt ??
                  null;

                const completed = Boolean(metaObj?.completed) || Boolean(completedAt);
                const overdue = Boolean(metaObj?.overdue) || Boolean(metaObj?.is_overdue) || false;

                const durationRaw =
                  (it as any)?.duration_s ??
                  (it as any)?.durationSec ??
                  metaObj?.duration_s ??
                  metaObj?.durationSec ??
                  null;

                const durationSecs = Number(durationRaw);
                const durationText = Number.isFinite(durationSecs) ? fmtDuration(durationSecs) : "";

                const chips: Array<{ key: string; text: string; cls: string; title?: string }> = [];

                // Type chip (NOTE/ACTION/CALL)
                chips.push({
                  key: "type",
                  text: typeLabel,
                  cls: "rounded-full border border-neutral-800 bg-neutral-900/40 px-2 py-0.5 text-[11px] text-neutral-300",
                });

                if (completed) {
                  chips.push({
                    key: "completed",
                    text: "completed",
                    cls: "rounded-full bg-green-500/10 px-2 py-0.5 text-[11px] text-green-300",
                  });
                }

                if (overdue) {
                  chips.push({
                    key: "overdue",
                    text: "overdue",
                    cls: "rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] text-red-300",
                  });
                }

                if (durationText) {
                  chips.push({
                    key: "duration",
                    text: durationText,
                    cls: "rounded-full border border-neutral-800 bg-neutral-950 px-2 py-0.5 text-[11px] text-neutral-400",
                    title: "Duration",
                  });
                }

                const statusText = metaString(metaObj?.status ?? (it as any)?.status);
                if (statusText && statusText !== "open" && statusText !== "completed") {
                  chips.push({
                    key: "status",
                    text: statusText,
                    cls: "rounded-full border border-neutral-800 bg-neutral-950 px-2 py-0.5 text-[11px] text-neutral-400",
                    title: "Status",
                  });
                }

                const keyBase =
                  (it as any)?.id ??
                  (it as any)?.event_id ??
                  (it as any)?.call_id ??
                  `${kind}-${created ?? ""}-${idx}`;

                return (
                  <li
                    key={String(keyBase)}
                    className="flex items-start gap-3 rounded-lg border border-neutral-900 bg-neutral-950 px-3 py-2"
                  >
                    <div className="mt-0.5 w-5 text-center text-sm">{iconFor(kind)}</div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm text-neutral-200">{title}</div>

                        {chips.map((c) => (
                          <span key={c.key} className={c.cls} title={c.title}>
                            {c.text}
                          </span>
                        ))}
                      </div>

                      {dueAt ? (
                        <div className="mt-1 text-[11px] text-neutral-500">Due: {metaString(dueAt)}</div>
                      ) : completedAt ? (
                        <div className="mt-1 text-[11px] text-neutral-500">Completed: {metaString(completedAt)}</div>
                      ) : null}
                    </div>

                    <div className="shrink-0 text-[11px] text-neutral-500">{fmtRel(created)}</div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="mt-3 rounded-lg border border-neutral-800 bg-neutral-900/20 px-3 py-2 text-sm text-neutral-400">
              No recent activity yet.
            </div>
          )}
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <h2 className="mb-2 text-sm font-semibold text-neutral-200">CRM Actions (Source of Truth)</h2>
          <p className="mb-3 text-sm text-neutral-500">Single source of truth for all work related to this contact.</p>

          {/* NOTE: CRM Actions are the single source of truth on the Contact page.
              Do not derive or duplicate from Assignments elsewhere. */}
          <ContactAssignmentsClient
            contactId={contactId}
            openActions={actions?.open ?? []}
            completedActions={actions?.completed ?? []}
          />
        </div>
      </section>

      {/* Notes */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <h2 className="mb-2 text-sm font-semibold text-neutral-200">Rep Notes</h2>
          <p className="text-xs text-neutral-500">Private notes for reps (context, objections, preferences).</p>
          <RepNotesClient contactId={contactId} />
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <h2 className="mb-2 text-sm font-semibold text-neutral-200">AI Guidance</h2>
          <p className="mb-3 text-xs text-neutral-500">Auto-generated sales brief based on notes and call history.</p>

          <AIBriefClient contactId={contactId} />
        </div>
      </section>

      {/* Bulk upload */}
      <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <h2 className="mb-2 text-sm font-semibold text-neutral-200">Bulk Upload Contacts</h2>
        <p className="text-sm text-neutral-500">Upload an Excel or CSV file to add or update contacts in bulk.</p>
      </section>
    </div>
  );
}
