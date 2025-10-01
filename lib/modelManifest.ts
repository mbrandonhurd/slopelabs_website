export type ModelManifest = {
  region: string;
  format: "long" | "wide";
  rowSampled: number;
  columnCount: number;
  timeColumn: string;
  valueColumn?: string;
  valueColumns?: string[];
  varColumn: string;
  levelColumn: string;
  regionColumn?: string;     // ← add
  parquetPath?: string;      // ← add (defaults to /data/<region>/weather_model.parquet)
  vars: { code: string; name?: string; unitsDefault?: string }[];
  levels: string[];
  hints?: { orderBy?: string; orderDir?: "asc" | "desc" };
};

export async function loadModelManifest(region: string): Promise<ModelManifest> {
  // Prefer shared manifest if it exists; fallback to region manifest
  const shared = await fetch(`/data/shared/model_manifest.json`, { cache: "force-cache" });
  if (shared.ok) return shared.json();
  const res = await fetch(`/data/${region}/model_manifest.json`, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Manifest not found for region=${region}`);
  return res.json();
}
