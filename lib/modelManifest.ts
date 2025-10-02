export type ModelManifest = {
  region: string;
  format: "long" | "wide";
  parquetPath?: string;       // ← add
  regionColumn?: string;      // ← add
  timeColumn: string;
  varColumn: string;
  levelColumn: string;
  valueColumn?: string;       // legacy
  valueColumns?: string[];    // ← prefer this
  vars?: { code: string; name?: string; unitsDefault?: string }[];
  levels?: string[];
  regions?: string[];
  hints?: { orderBy?: string; orderDir?: "asc" | "desc" };
};

export async function loadModelManifest(region: string): Promise<ModelManifest> {
  // Prefer a shared manifest if present; fallback to per-region
  const shared = await fetch(`/data/shared/model_manifest.json`, { cache: "force-cache" });
  if (shared.ok) return shared.json();
  const res = await fetch(`/data/${region}/model_manifest.json`, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Manifest not found for region=${region}`);
  return res.json();
}
