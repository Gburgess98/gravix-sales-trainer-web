import Link from "next/link";
import CsvImportClient from "./CsvImportClient";

export default function ContactsImportPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Import Contacts</h1>
          <p className="mt-1 text-sm text-neutral-500">
            Upload a CSV, preview + validate, then import (upsert by email).
          </p>
        </div>
        <Link
          href="/crm/overview"
          className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
        >
          ← Back to CRM
        </Link>
      </div>

      <CsvImportClient />
    </div>
  );
}