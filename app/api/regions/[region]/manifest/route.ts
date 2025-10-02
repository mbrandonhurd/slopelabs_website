// app/api/regions/[region]/manifest/route.ts
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

  // Always use the SHARED model manifest
  const sharedModelManifestPath = path.join(process.cwd(), "public", "data", "shared", "model_manifest.json");
  const sharedModel = readJsonSafe(sharedModelManifestPath);
  if (!sharedModel) {
    return NextResponse.json({ error: "Shared model manifest not found" }, { status: 404 });
  }

  // Optional: enforce that the region exists (if you keep a regions.json)
  const regionsPath = path.join(process.cwd(), "public", "data", "shared", "regions.json");
  const regionsList = readJsonSafe(regionsPath);
  if (Array.isArray(regionsList) && !regionsList.includes(region)) {
    return NextResponse.json({ error: `Region '${region}' not found` }, { status: 404 });
  }

  // Build a lightweight per-region manifest using the shared model
  const synthetic = {
    region,
    run_time_utc: new Date().toISOString(),
    version: "shared-model",
    artifacts: {
      tiles_base: "https://tile.openstreetmap.org/",
      // expose helpful links; UI can ignore if not used
      model_manifest_json: "/data/shared/model_manifest.json",
      parquet_path: sharedModel.parquetPath || "/data/shared/weather_model.parquet"
    }
  };

  return NextResponse.json(synthetic, { headers: { "Cache-Control": "no-store" } });
}
