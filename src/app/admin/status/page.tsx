// src/app/admin/status/page.tsx
export const dynamic = "force-dynamic";

export default function AdminStatusPage() {
  return (
    <div className="max-w-3xl mx-auto py-10 px-6">
      <h1 className="text-2xl font-semibold mb-4">Admin · System Status</h1>
      <p className="mb-6 opacity-80">
        This page pings the backend status endpoint via the proxy. Use the links
        below to verify connectivity in your environment.
      </p>
      <ul className="list-disc ml-6 space-y-2">
        <li>
          <a
            className="text-blue-600 underline"
            href="/api/proxy/v1/admin/status"
            target="_blank"
            rel="noreferrer"
          >
            /api/proxy/v1/admin/status
          </a>
        </li>
        <li>
          <a
            className="text-blue-600 underline"
            href="/api/proxy/v1/health?debug=1"
            target="_blank"
            rel="noreferrer"
          >
            /api/proxy/v1/health?debug=1
          </a>
        </li>
      </ul>
    </div>
  );
}