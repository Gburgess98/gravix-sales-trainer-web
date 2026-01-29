import Link from "next/link";

export default function ContactsImportPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-neutral-400">
            CRM · Contacts
          </div>
          <h1 className="text-2xl font-semibold text-white">Bulk Import</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Upload a CSV, preview changes, then import safely (upsert by email).
          </p>
        </div>

        <Link
          href="/crm/overview"
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10"
        >
          Back to CRM
        </Link>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/40 p-6">
        <div className="text-sm text-neutral-300">
          ✅ Route fixed. Now wire your existing Bulk Upload UI into this page (next step).
        </div>

        <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-neutral-400">
          If you already built a “Bulk Upload Contacts” component inside the contact page,
          we’ll move it into a shared component and render it here.
        </div>
      </div>
    </div>
  );
}