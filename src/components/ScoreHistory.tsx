// web/src/components/ScoreHistory.tsx
'use client';

type Item = { created_at: string; overall: number };

function toPoints(items: Item[], w = 120, h = 32) {
  if (!items.length) return "";
  const xs = items.map((_, i) => (i / Math.max(1, items.length - 1)) * (w - 2)); // 1px padding
  const ys = items.map(it => {
    const v = Math.max(0, Math.min(100, Number(it.overall)));
    // lower scores should be visually lower (invert)
    return (1 - v / 100) * (h - 2);
  });
  return xs.map((x, i) => `${(x + 1).toFixed(1)},${(ys[i] + 1).toFixed(1)}`).join(" ");
}

export default function ScoreHistory({
  items,
  className = "",
  showPills = true,
}: {
  items: Item[];
  className?: string;
  showPills?: boolean;
}) {
  if (!items?.length) {
    return <div className={`text-xs opacity-60 ${className}`}>No previous scores yet</div>;
  }

  const w = 120, h = 32;
  const points = toPoints(items, w, h);
  const latest = items[0]?.overall ?? null;

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          opacity={0.85}
        />
      </svg>
      {showPills && typeof latest === "number" && (
        <div className="flex items-center gap-2 text-xs">
          <span className={`px-2 py-0.5 rounded-full border ${
            latest >= 80
              ? "bg-green-500/20 text-green-200 border-green-400/30"
              : latest >= 60
              ? "bg-yellow-500/20 text-yellow-200 border-yellow-400/30"
              : "bg-red-500/20 text-red-200 border-red-400/30"
          }`}>
            Latest: {Math.round(latest)}
          </span>
          <span className="px-2 py-0.5 rounded-full border bg-zinc-500/10 text-zinc-300 border-zinc-400/20">
            {items.length} runs
          </span>
        </div>
      )}
    </div>
  );
}
