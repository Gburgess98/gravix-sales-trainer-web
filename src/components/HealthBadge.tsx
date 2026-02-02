import * as React from "react";

type Props = {
  status?: "hot" | "warm" | "cold" | "at_risk" | string | null;
  score?: number | null;
  title?: string;
  compact?: boolean;
};

const labelFor = (s?: string | null) => {
  switch (s) {
    case "at_risk": return "At Risk";
    case "hot": return "Hot";
    case "warm": return "Warm";
    case "cold": return "Cold";
    default: return "Unknown";
  }
};

const clsFor = (s?: string | null) => {
  switch (s) {
    case "at_risk": return "bg-red-500/15 text-red-200 border-red-500/30";
    case "hot": return "bg-emerald-500/15 text-emerald-200 border-emerald-500/30";
    case "warm": return "bg-yellow-500/15 text-yellow-200 border-yellow-500/30";
    case "cold": return "bg-sky-500/15 text-sky-200 border-sky-500/30";
    default: return "bg-neutral-800/60 text-neutral-300 border-neutral-700";
  }
};

export default function HealthBadge({ status, score, title, compact }: Props) {
  const label = labelFor(status);
  const tooltip =
    title ||
    (status === "at_risk"
      ? "Overdue follow-up needed"
      : status === "cold"
      ? "No recent outreach"
      : status === "warm"
      ? "Active but not closed"
      : status === "hot"
      ? "Recently engaged"
      : "Health not available");

  const pulse = status === "at_risk" ? "animate-pulse" : "";
  const size = compact ? "text-xs px-2 py-0.5" : "text-sm px-2.5 py-1";

  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-2 rounded-full border ${size} ${clsFor(status)} ${pulse}`}
    >
      <span className="font-medium">{label}</span>
      {typeof score === "number" && Number.isFinite(score) ? (
        <span className="opacity-80">{score}</span>
      ) : null}
    </span>
  );
}