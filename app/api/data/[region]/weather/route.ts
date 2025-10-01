export const runtime = "nodejs";

import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

/** Normalize region strings so we can compare case-insensitively and ignore underscores/spaces. */
function normalizeRegion(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Try shared first, fall back to per-region file. Return absolute path or null. */
function resolveStationCsv(region: string): string | null {
  const shared = path.join(process.cwd(), "public", "data", "shared", "weather_station.csv");
  if (fs.existsSync(shared)) return shared;

  const regional = path.join(process.cwd(), "public", "data", region, "weather_station.csv");
  if (fs.existsSync(regional)) return regional;

  return null;
}

export async function GET(req: Request, { params }: { params: { region: string } }) {
  try {
    const url = new URL(req.url);
    const kind = (url.searchParams.get("kind") || "model").toLowerCase();

    // This endpoint currently only serves station CSV rows.
    if (kind !== "station") {
      return NextResponse.json({ rows: [] });
    }

    const file = resolveStationCsv(params.region);
    if (!file) return NextResponse.json({ rows: [] });

    const raw = fs.readFileSync(file, "utf-8");
    const rows: any[] = parse(raw, { columns: true, skip_empty_lines: true });

    const want = normalizeRegion(params.region);

    // Filter by region column in CSV (case-insensitive, underscores vs spaces ignored).
    const filtered = rows.filter((r) => normalizeRegion(r?.region) === want);

    return NextResponse.json({ rows: filtered });
  } catch (e: any) {
    return NextResponse.json(
      { rows: [], error: e?.message || "parse failed" },
      { status: 500 }
    );
  }
}
