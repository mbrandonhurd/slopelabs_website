export type ModelManifest = {
  region: string;
  format: "long" | "wide";
  rowSampled: number;
  columnCount: number;
  timeColumn: string;
  valueColumn?: string;
  valueColumns?: string[];       // optional (if you emit multiple)
  varColumn: string;
  levelColumn: string;
  vars: { code: string; name?: string; unitsDefault?: string }[];
  levels: string[];
  hints?: { orderBy?: string; orderDir?: "asc" | "desc" };
};

export async function loadModelManifest(region: string): Promise<ModelManifest> {
  const res = await fetch(`/data/${region}/model_manifest.json`, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Manifest not found for region=${region}`);
  return res.json();
}
