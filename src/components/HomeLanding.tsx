// src/components/HomeLanding.tsx
import Link from "next/link";

export default function HomeLanding() {
  return (
    <main className="p-8">
      <h1 className="text-xl font-semibold mb-4">Gravix</h1>
      <p className="text-sm text-white/60 mb-6">
        Welcome. Use the links below to navigate.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/recent-calls" className="block" data-testid="nav-recent-calls">
          <div className="w-full rounded-lg border border-white/20 px-4 py-3 hover:bg-white/5">
            Recent Calls
          </div>
        </Link>

        <Link href="/crm/overview" className="block" data-testid="nav-crm-overview">
          <div className="w-full rounded-lg border border-white/20 px-4 py-3 hover:bg-white/5">
            CRM Overview
          </div>
        </Link>

        <Link href="/proxy/health" className="block" data-testid="nav-proxy-health">
          <div className="w-full rounded-lg border border-white/20 px-4 py-3 hover:bg-white/5">
            Proxy Health
          </div>
        </Link>

        {/* NEW: Call Library */}
        <Link
          href="/call-library"
          className="group rounded-xl border border-neutral-800 bg-neutral-900/40 px-4 py-3 hover:border-neutral-500 hover:bg-neutral-900 transition-colors"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-medium text-neutral-50">Call Library</div>
              <p className="text-sm text-neutral-400">
                Browse all live calls, AI sparring sessions, and uploads in one place.
              </p>
            </div>
            <span className="text-xs text-neutral-400 group-hover:text-neutral-100">
              Open →
            </span>
          </div>
        </Link>
      </div>
    </main>
  );
}