export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { loadRegionBundle } from "@/lib/server/regionData";

export async function GET(_: Request, { params }: { params: { region: string } }) {
  try {
    const { avalanches } = await loadRegionBundle(params.region);
    return NextResponse.json({ avalanches });
  } catch (e: any) {
    return NextResponse.json(
      { avalanches: [], error: e?.message || "Failed to read avalanches" },
      { status: 500 }
    );
  }
}
