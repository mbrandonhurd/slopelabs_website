import type { ForecastJSON } from "@/types/core";

export default function ProblemsChips({ forecast }: { forecast: ForecastJSON }) {
  return (
    <div className="flex flex-wrap gap-2">
      {forecast.problems.map((p, i) => (
        <span key={i} className="inline-flex items-center rounded-full border px-3 py-1 text-sm bg-white">
          <span className="font-medium mr-1">{p.type}</span>
          <span className="text-gray-500">({p.likelihood}, {p.size})</span>
        </span>
      ))}
    </div>
  );
}
