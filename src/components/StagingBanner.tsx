// Day 271 — visible staging marker. Renders ONLY when NEXT_PUBLIC_APP_ENV is
// "staging"; in production the variable is unset and this returns null, so it can
// never appear there. Non-secret, driven by one public env var. Accessible text,
// exposes no infrastructure detail. NODE_ENV alone is never used as the signal.
//
// Day 45 — fixed 28px height, published as --staging-banner-h so the full-height
// app shell can subtract exactly the banner (it used to overflow the viewport by
// the banner's height). Larger, higher-contrast text; the short label keeps it on
// one line at 390px wide.

const APP_ENV = process.env.NEXT_PUBLIC_APP_ENV;

export function StagingBanner() {
  if (APP_ENV !== "staging") return null;
  return (
    <>
      <style>{":root{--staging-banner-h:28px}"}</style>
      <div
        role="status"
        aria-label="Staging environment"
        className="sticky top-0 z-[100] flex h-7 w-full items-center justify-center border-b border-amber-400/50 bg-amber-500/25 px-3 text-xs font-semibold uppercase tracking-[0.12em] text-amber-200 whitespace-nowrap"
      >
        <span className="sm:hidden">Staging · test data</span>
        <span className="hidden sm:inline">Staging — synthetic data, not production</span>
      </div>
    </>
  );
}
