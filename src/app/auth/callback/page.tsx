import { Suspense } from "react";
import CallbackClient from "./CallbackClient";

export const dynamic = "force-dynamic"; // avoids static prerender issues

export default function Page() {
  return (
    <div className="p-6">
      <Suspense fallback={<p className="text-sm text-neutral-500">Loading…</p>}>
        <CallbackClient />
      </Suspense>
    </div>
  );
}