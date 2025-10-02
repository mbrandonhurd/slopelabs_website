export const runtime = "nodejs";

import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

function fileExists(p: string) {
  try { return fs.existsSync(p); } catch { return false; }
}

export async function GET(_: Request, { params }: { params: { region: string } }) {
  const region = params.region;

  // A) First try the legacy per-region manifest
  const perRegion = path.join(process.cwd(), "public", "data", region, "manifest.json");
  if (fileExists(perRegion)) {
    const raw = fs.readFileSync(perRegion, "utf-8");
    return NextResponse.json(JSON.parse(raw), { headers: { "Cache-Control": "no-store" } });
  }

  // B) Fallback: build a synthetic manifest from the shared model manifest
  const sharedManifestPath = path.join(process.cwd(), "public", "data", "shared", "model_manifest.json");
  if (fileExists(sharedManifestPath)) {
    const shared = JSON.parse(fs.readFileSync(sharedManifestPath, "utf-8"));

    // Optional: check if region exists in the shared parquet via regions.json (if you keep one)
    const regionsJson = path.join(process.cwd(), "public", "data", "shared", "regions.json");
    if (fileExists(regionsJson)) {
      const regions = JSON.parse(fs.readFileSync(regionsJson, "utf-8"));
      if (Array.isArray(regions) && !regions.includes(region)) {
        return NextResponse.json({ error: "Region not found" }, { status: 404 });
      }
    }

    // Construct a minimal manifest the UI understands
    const synthetic = {
      region,
      run_time_utc: new Date().toISOString(),
      version: "shared-model",
      // keep the same shape your UI expects
      artifacts: {
        // tiles for MapPanel (can swap to your own style)
        tiles_base: "https://tile.openstreetmap.org/",
        // keep legacy keys; UI will ignore if not used
        forecast_json: `/data/${region}/forecast.json`,
        summary_json: `/data/${region}/summary.json`,
        // expose shared model manifest (optional)
        model_manifest_json: "/data/shared/model_manifest.json",
        parquet_path: shared.parquetPath || "/data/shared/weather_model.parquet"
      }
    };

    return NextResponse.json(synthetic, { headers: { "Cache-Control": "no-store" } });
  }

  // C) If neither exists, return 404
  return NextResponse.json({ error: "Manifest not found" }, { status: 404 });
}
