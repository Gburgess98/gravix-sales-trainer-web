// src/app/crm/overview/page.tsx
export const dynamic = "force-dynamic";

export default function CrmOverviewPage() {
  return (
    <div className="max-w-5xl mx-auto py-10 px-6">
      <h1 className="text-2xl font-semibold mb-4">CRM · Overview</h1>
      <p className="opacity-80">This is a stub while we wire data. The route is live.</p>
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="rounded-lg border p-4">
          <div className="text-sm opacity-70">Total Calls</div>
          <div className="text-2xl font-semibold">—</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm opacity-70">Conversion Rate</div>
          <div className="text-2xl font-semibold">—</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-sm opacity-70">Avg. Coaching Score</div>
          <div className="text-2xl font-semibold">—</div>
        </div>
      </div>
    </div>
  );
}