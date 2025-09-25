import type { Manifest, ForecastJSON } from "@/types/core";
export async function getManifest(region: string): Promise<Manifest> {
  const res = await fetch(`/api/regions/${region}/manifest`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Manifest fetch failed: ${res.status}`);
  return res.json() as Promise<Manifest>;
}
export async function getForecast(url: string): Promise<ForecastJSON> {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Forecast fetch failed: ${res.status}`);
  return res.json() as Promise<ForecastJSON>;
}
