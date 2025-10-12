// src/components/ScoreSparkline.tsx
'use client';

import { memo, useMemo } from 'react';

type Props = {
  scores: number[];          // e.g. [72, 76, 65, 81, 79]
  width?: number;            // default 80
  height?: number;           // default 24
  strokeWidth?: number;      // default 2
  className?: string;        // tailwind classes for outer wrapper (controls color)
  title?: string;            // accessible label
  maxPoints?: number;        // NEW: how many points to render (default 24)
};

export default memo(function ScoreSparkline({
  scores,
  width = 80,
  height = 24,
  strokeWidth = 2,
  className,
  title = 'Score trend',
  maxPoints = 24,
}: Props) {
  const path = useMemo(() => {
    if (!scores || scores.length === 0) return '';

    // Show the last N points
    const pts = scores.slice(-maxPoints);

    // Sparkline Y-domain from data (fallback to [0,100])
    const minVal = Math.min(...pts, 0);
    const maxVal = Math.max(...pts, 100);
    const domain = maxVal === minVal ? 1 : (maxVal - minVal);

    const innerW = width - strokeWidth * 2;
    const innerH = height - strokeWidth * 2;
    const stepX = pts.length > 1 ? innerW / (pts.length - 1) : 0;

    return pts
      .map((v, i) => {
        const x = strokeWidth + i * stepX;
        const yNorm = (v - minVal) / domain; // 0..1
        const y = strokeWidth + (innerH - yNorm * innerH);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [scores, width, height, strokeWidth, maxPoints]);

  const last = scores?.[scores.length - 1] ?? null;
  const pillColour =
    last === null
      ? 'bg-slate-700/40 text-slate-300'
      : last >= 80
      ? 'bg-green-600/20 text-green-400'
      : last >= 60
      ? 'bg-amber-600/20 text-amber-300'
      : 'bg-red-600/20 text-red-300';

  if (!scores || scores.length === 0) return null;

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={title}
          className="overflow-visible"
        >
          <path
            d={path}
            fill="none"
            vectorEffect="non-scaling-stroke"
            strokeWidth={strokeWidth}
            stroke="currentColor"   // inherits from parent color
          />
        </svg>

        <span className={`text-xs px-2 py-0.5 rounded-full ${pillColour}`}>
          {last !== null ? `${last}` : '—'}
        </span>
      </div>
    </div>
  );
});
