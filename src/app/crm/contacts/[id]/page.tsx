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
  params: { id: string };
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const base = process.env.INTERNAL_API_BASE_URL ?? "http://localhost:3000";

  // Fetch contact (and health) server-side
  let health: any = null;
  try {
    const h = headers();
    const res = await fetch(
      `${base}/api/proxy/v1/crm/contacts/${encodeURIComponent(params.id)}`,
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
    const h = headers();
    const res = await fetch(
      `${base}/api/proxy/v1/crm/contacts/${encodeURIComponent(params.id)}/actions?limit=50`,
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

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-8">
      {searchParams?.autoAssigned === "1" ? (
        <div className="rounded-lg border border-green-800 bg-green-900/20 px-4 py-2 text-sm text-green-300">
          ✓ Action auto-assigned successfully
        </div>
      ) : null}

      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">CRM · Contact</h1>
          <p className="text-sm text-neutral-400">
            Relationship context, activity, and coaching signals.
          </p>
        </div>

        <Link
          href="/crm/overview"
          className="text-sm text-neutral-400 hover:text-neutral-200 underline"
        >
          ← Back to CRM
        </Link>
      </div>

      {/* Contact header */}
      <ContactHeaderClient contactId={params.id} health={health} />

      {health ? (
        <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-neutral-200">
                Contact Health
              </h2>
              <p className="text-xs text-neutral-500">
                Overall relationship status and urgency.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={[
                  "rounded-full px-3 py-1 text-xs font-semibold",
                  health.status === "hot"
                    ? "bg-green-500/15 text-green-400"
                    : health.status === "warm"
                    ? "bg-yellow-500/15 text-yellow-400"
                    : "bg-red-500/15 text-red-400",
                ].join(" ")}
              >
                {String(health.status || "").toUpperCase()}
              </span>

              <span className="text-xs text-neutral-400">
                Score: {health.score}
              </span>
            </div>
          </div>

          {health.reasons?.length ? (
            <ul className="mt-3 list-disc pl-5 text-xs text-neutral-400 space-y-1">
              {health.reasons.map((r: string) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : null}

          {health.next_action ? (
            <div className="mt-3 text-xs text-neutral-300">
              <span className="font-semibold">Suggested next step:</span>{" "}
              {health.next_action}
            </div>
          ) : null}

          {/* Next Action block (health-driven priorities) */}
          <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900/40 p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-neutral-200">
                  Next Action
                </div>
                <div className="mt-1 text-sm text-neutral-200">
                  {health.next_action ?? "No next action yet."}
                </div>
              </div>

              <div className="shrink-0 text-right">
                <div className="text-[11px] text-neutral-500">Why</div>
                <div className="mt-1 text-xs text-neutral-400">
                  {health.reasons?.length
                    ? health.reasons.slice(0, 2).join(" • ")
                    : "—"}
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-md border border-neutral-800 bg-neutral-950 p-2">
                <div className="text-[11px] text-neutral-500">Overdue</div>
                <div className="text-xs font-semibold text-neutral-200">
                  {health.signals?.overdue_assignments ?? 0}
                </div>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950 p-2">
                <div className="text-[11px] text-neutral-500">Critical notes</div>
                <div className="text-xs font-semibold text-neutral-200">
                  {health.signals?.critical_notes ?? 0}
                </div>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950 p-2">
                <div className="text-[11px] text-neutral-500">Important notes</div>
                <div className="text-xs font-semibold text-neutral-200">
                  {health.signals?.important_notes ?? 0}
                </div>
              </div>
              <div className="rounded-md border border-neutral-800 bg-neutral-950 p-2">
                <div className="text-[11px] text-neutral-500">Last contacted</div>
                <div className="text-xs font-semibold text-neutral-200">
                  {health.signals?.last_contacted_days == null
                    ? "Never"
                    : `${health.signals.last_contacted_days}d`}
                </div>
              </div>
            </div>

            <form action={autoAssign} className="mt-3 flex gap-2">
              <input type="hidden" name="contactId" value={params.id} />

              <button
                type="submit"
                name="dryRun"
                value="1"
                className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-300 hover:bg-neutral-800"
              >
                Preview auto‑assign
              </button>

              <button
                type="submit"
                className="rounded-md bg-indigo-600/20 px-3 py-1.5 text-xs font-semibold text-indigo-300 hover:bg-indigo-600/30"
              >
                Auto‑assign this action
              </button>
            </form>
          </div>
        </section>
      ) : null}

      {/* Context row */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <h2 className="mb-2 text-sm font-semibold text-neutral-200">
            Recent Activity
          </h2>
          <p className="text-sm text-neutral-500">
            Calls, messages, and key interactions linked to this contact.
          </p>
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <h2 className="mb-2 text-sm font-semibold text-neutral-200">
            CRM Actions (Source of Truth)
          </h2>
          <p className="mb-3 text-sm text-neutral-500">
            Single source of truth for all work related to this contact.
          </p>

          {/* NOTE: CRM Actions are the single source of truth on the Contact page.
              Do not derive or duplicate from Assignments elsewhere. */}
          <ContactAssignmentsClient
            contactId={params.id}
            openActions={actions?.open ?? []}
            completedActions={actions?.completed ?? []}
          />
        </div>
      </section>

      {/* Notes */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <h2 className="mb-2 text-sm font-semibold text-neutral-200">
            Rep Notes
          </h2>
          <p className="text-xs text-neutral-500">
            Private notes for reps (context, objections, preferences).
          </p>
          <RepNotesClient contactId={params.id} />
        </div>

        <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <h2 className="mb-2 text-sm font-semibold text-neutral-200">
            AI Guidance
          </h2>
          <p className="mb-3 text-xs text-neutral-500">
            Auto-generated sales brief based on notes and call history.
          </p>

          <AIBriefClient contactId={params.id} />
        </div>
      </section>

      {/* Bulk upload */}
      <section className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
        <h2 className="mb-2 text-sm font-semibold text-neutral-200">
          Bulk Upload Contacts
        </h2>
        <p className="text-sm text-neutral-500">
          Upload an Excel or CSV file to add or update contacts in bulk.
        </p>
      </section>
    </div>
  );
}