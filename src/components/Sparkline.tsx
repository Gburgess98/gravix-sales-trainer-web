"use client";
import ScoreSparkline from "./ScoreSparkline";

type Props = {
  values?: number[];        // new generic prop (yesterday's usage)
  scores?: number[];        // legacy prop from ScoreSparkline consumers
  width?: number;           // default 80
  height?: number;          // default 24
  strokeWidth?: number;     // default 2
  className?: string;       // tailwind classes for color
  title?: string;           // accessible label
  maxPoints?: number;       // how many points to render (default 24)
};

export default function Sparkline({
  values,
  scores,
  width,
  height,
  strokeWidth,
  className,
  title,
  maxPoints,
}: Props) {
  // prefer explicit values; fall back to scores; then empty array
  const series = values ?? scores ?? [];
  return (
    <ScoreSparkline
      scores={series}
      width={width}
      height={height}
      strokeWidth={strokeWidth}
      className={className}
      title={title}
      maxPoints={maxPoints}
    />
  );
}