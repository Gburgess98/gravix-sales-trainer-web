// web/src/components/XpProgress.tsx
export default function XpProgress({ xp }: { xp: number }) {
  const level = Math.floor((xp || 0) / 100);
  const pct = (xp || 0) % 100;
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs mb-1">
        <span>Level {level}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 bg-gray-700 rounded">
        <div
          className="h-2 bg-gradient-to-r from-green-500 to-emerald-400 rounded"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}