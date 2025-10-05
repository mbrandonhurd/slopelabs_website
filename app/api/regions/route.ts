export const runtime = "nodejs";
import { NextResponse } from "next/server";

import { listRegions } from "@/lib/server/regionData";

export async function GET() {
  const regions = await listRegions();
  return NextResponse.json({ regions });
}
