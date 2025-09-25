import type { ForecastJSON, ElevationBand } from "@/types/core";
const dangerColors: Record<string, string> = {
  low: "bg-green-600",
  moderate: "bg-yellow-500",
  considerable: "bg-orange-500",
  high: "bg-red-600",
  extreme: "bg-black text-white",
};
export default function DangerCards({ forecast }: { forecast: ForecastJSON }) {
  const bands: ElevationBand[] = ["above_treeline","treeline","below_treeline"];
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {bands.map(b => {
        const d = forecast.dangerRatings[b];
        return (
          <div key={b} className="card overflow-hidden">
            <div className={`h-2 ${dangerColors[d] || "bg-gray-300"}`} />
            <div className="card-c">
              <div className="text-sm text-gray-500 capitalize">{b.replace("_"," ")}</div>
              <div className="text-2xl font-semibold capitalize">{d ?? "unknown"}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
