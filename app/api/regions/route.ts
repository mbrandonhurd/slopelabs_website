export const runtime = "nodejs";
import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export async function GET() {
  const dataDir = path.join(process.cwd(), "public", "data");
  const sharedRegions = path.join(dataDir, "shared", "regions.json");

  // Preferred: explicit list
  if (fs.existsSync(sharedRegions)) {
    try {
      const arr = JSON.parse(fs.readFileSync(sharedRegions, "utf-8"));
      if (Array.isArray(arr)) return NextResponse.json({ regions: arr });
    } catch {}
  }

  // Fallback: directory names (old behavior)
  const items = fs.existsSync(dataDir) ? fs.readdirSync(dataDir, { withFileTypes: true }) : [];
  const regions = items.filter(d => d.isDirectory() && d.name !== "shared").map(d => d.name);
  return NextResponse.json({ regions });
}
