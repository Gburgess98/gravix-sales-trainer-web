// at top with other imports
import { bypassHeaders } from "@/lib/bypass";

// find your loader/fetcher where you call the proxy, e.g.:
async function loadPage({ page, status, q }: { page: number; status?: string; q?: string }) {
  const params = new URLSearchParams();
  params.set("limit", "20");
  params.set("page", String(page));
  if (status && status !== "all") params.set("status", status);
  if (q) params.set("q", q);

  const res = await fetch(`/api/proxy/v1/calls/paged?${params.toString()}`, {
  headers: {
    "content-type": "application/json",
    ...(process.env.NODE_ENV === "development" ? { "x-org-id": "dev" } : {}),
  },
  cache: "no-store",
});

  const res = await fetch(`/api/proxy/v1/calls/paged?${params.toString()}`, {
    headers: {
      ...bypassHeaders(),                  // 👈 add this
      "x-org-id": "dev",                   // optional: if your API looks for org
      "content-type": "application/json",
    },
    // cache: "no-store", // keep if you were already using it
  });

  if (!res.ok) {
    throw new Error(`Failed to load: ${res.status}`);
  }
  return res.json();
}