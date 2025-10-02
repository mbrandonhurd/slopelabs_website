export const runtime = "nodejs";
import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

function readJsonSafe(p: string): any | null {
  try {
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    console.error("[region manifest] invalid JSON:", p, e);
    return null;
  }
}

export async function GET(_: Request, { params }: { params: { region: string } }) {
  const region = params.region;
  console.log("[api/regions/:region/manifest] hit for region =", region);

  const sharedModelManifestPath = path.join(process.cwd(), "public", "data", "shared", "model_manifest.json");
  const sharedModel = readJsonSafe(sharedModelManifestPath);
  if (!sharedModel) {
    console.error("[api/regions/:region/manifest] missing shared model manifest");
    return NextResponse.json({ error: "Shared model manifest not found" }, { status: 404 });
  }

  // optional: check regions.json
  const regionsPath = path.join(process.cwd(), "public", "data", "shared", "regions.json");
  const regionsList = readJsonSafe(regionsPath);
  if (Array.isArray(regionsList) && !regionsList.includes(region)) {
    console.warn("[api/regions/:region/manifest] region not in regions.json ->", region);
    // you can 404 here if you want stricter behavior
  }

  const synthetic = {
    region,
    run_time_utc: new Date().toISOString(),
    version: "shared-model",
    artifacts: {
      tiles_base: "https://tile.openstreetmap.org/",
      model_manifest_json: "/data/shared/model_manifest.json",
      parquet_path: sharedModel.parquetPath || "/data/shared/weather_model.parquet"
    }
  };
  console.log("[api/regions/:region/manifest] synthetic manifest =", JSON.stringify(synthetic));
  return NextResponse.json(synthetic, { headers: { "Cache-Control": "no-store" } });
}
