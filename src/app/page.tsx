// src/app/page.tsx
import ToastSmoke from '@/components/ToastSmoke';

export default function HomePage() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Gravix</h1>
      <p className="opacity-80">Welcome. Use the links below to navigate.</p>

      <ToastSmoke />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <a className="rounded border p-3 hover:bg-neutral-50/5" href="/recent-calls">Recent Calls</a>
        <a className="rounded border p-3 hover:bg-neutral-50/5" href="/crm/overview">CRM Overview</a>
        <a className="rounded border p-3 hover:bg-neutral-50/5" href="/admin/status">Admin · Status</a>
        <a className="rounded border p-3 hover:bg-neutral-50/5" href="/health">Proxy Health</a>
      </div>
    </div>
  );
}