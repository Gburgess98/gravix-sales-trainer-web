import Link from "next/link";
import ContactHeaderClient from "./ContactHeaderClient";
import RepNotesClient from "./RepNotesClient";
import AIBriefClient from "./AIBriefClient";
import ContactAssignmentsClient from "./ContactAssignmentsClient";


export default function ContactPage({ params }: { params: { id: string } }) {
  return (
    <div className="mx-auto max-w-6xl p-6 space-y-8">
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
      <ContactHeaderClient contactId={params.id} />

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
            Assignments
          </h2>
          <p className="mb-3 text-sm text-neutral-500">
            Open and completed assignments tied to this contact.
          </p>
          <ContactAssignmentsClient contactId={params.id} />
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