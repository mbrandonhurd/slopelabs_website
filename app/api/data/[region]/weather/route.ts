export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { loadRegionBundle } from "@/lib/server/regionData";

export async function GET(req: Request, { params }: { params: { region: string } }) {
  try {
    const url = new URL(req.url);
    const kind = (url.searchParams.get("kind") || "model").toLowerCase();

    if (kind !== "station") {
      return NextResponse.json({ rows: [] });
    }

    const bundle = await loadRegionBundle(params.region);
    const rows: Record<string, unknown>[] = [];
    Object.entries(bundle.stationSummary || {}).forEach(([band, tables]) => {
      tables?.forEach((table) => {
        table.rows.forEach((row) => {
          rows.push({ ...row, elevation_band: band });
        });
      });
    });

    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json(
      { rows: [], error: e?.message || "parse failed" },
      { status: 500 }
    );
  }
}
