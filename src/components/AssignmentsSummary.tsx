'use client';
export default function AssignmentsSummary(props: { open?: number; dueSoon?: number; completed7d?: number }) {
  const { open = 0, dueSoon = 0, completed7d = 0 } = props;
  return (
    <div className="rounded border p-3 flex items-center gap-4 text-sm">
      <span className="px-2 py-1 rounded border">🟡 Open: {open}</span>
      <span className="px-2 py-1 rounded border">🟠 Due soon: {dueSoon}</span>
      <span className="px-2 py-1 rounded border">✅ Completed 7d: {completed7d}</span>
    </div>
  );
}