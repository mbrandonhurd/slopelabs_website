export const runtime = "nodejs";
import { NextResponse } from "next/server";

import { loadRegionBundle } from "@/lib/server/regionData";

export async function GET(_: Request, { params }: { params: { region: string } }) {
  const region = params.region;
  if (!region) {
    return NextResponse.json({ error: "Missing region" }, { status: 400 });
  }

  try {
    const { manifest } = await loadRegionBundle(region);
    return NextResponse.json(manifest, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[api/regions/:region/manifest] failed", err);
    return NextResponse.json({ error: "Manifest not available" }, { status: 404 });
  }
}
