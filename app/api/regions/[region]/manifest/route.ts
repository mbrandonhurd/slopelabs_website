export const runtime = "nodejs";

import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

/** safe read JSON from file path */
function readJson(file: string) {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

/** resolve the manifest path: region → shared → null */
function resolveManifestPath(region: string): string | null {
  const regionPath = path.join(process.cwd(), "public", "data", region, "manifest.json");
  if (fs.existsSync(regionPath)) return regionPath;

  const sharedPath = path.join(process.cwd(), "public", "data", "shared", "manifest.json");
  if (fs.existsSync(sharedPath)) return sharedPath;

  return null;
}

export async function GET(_: Request, { params }: { params: { region: string } }) {
  try {
    const p = resolveManifestPath(params.region);
    if (!p) {
      return NextResponse.json(
        { error: "manifest.json not found", tried: [
            `/public/data/${params.region}/manifest.json`,
            `/public/data/shared/manifest.json`,
          ],
        },
        { status: 404 }
      );
    }

    const json = readJson(p);
    return NextResponse.json(json, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "failed to read manifest.json" },
      { status: 500 }
    );
  }
}
