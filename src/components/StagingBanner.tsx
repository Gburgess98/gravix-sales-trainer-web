// Day 271 — visible staging marker. Renders ONLY when NEXT_PUBLIC_APP_ENV is
// "staging"; in production the variable is unset and this returns null, so it can
// never appear there. Non-secret, driven by one public env var. Accessible text,
// exposes no infrastructure detail, and does not disturb layout (a thin sticky
// strip). NODE_ENV alone is never used as the signal.

const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV;

export function StagingBanner() {
  if (APP_ENV !== "staging") return null;
  return (
    <div
      role="status"
      aria-label="Staging environment"
      className="sticky top-0 z-[100] w-full bg-amber-500/15 border-b border-amber-500/30 px-4 py-1 text-center text-[11px] font-medium uppercase tracking-[0.14em] text-amber-300"
    >
      Staging — synthetic data, not production
    </div>
  );
}
