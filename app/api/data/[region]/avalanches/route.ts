export const runtime = "nodejs";

import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

/** Normalize region strings so we can compare case-insensitively and ignore underscores/spaces. */
function normalizeRegion(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Try shared first, fall back to per-region file. Return absolute path or null. */
function resolveAvalancheFile(region: string): string | null {
  const shared = path.join(process.cwd(), "public", "data", "shared", "avalanches.json");
  if (fs.existsSync(shared)) return shared;

  const regional = path.join(process.cwd(), "public", "data", region, "avalanches.json");
  if (fs.existsSync(regional)) return regional;

  return null;
}

export async function GET(_: Request, { params }: { params: { region: string } }) {
  try {
    const want = normalizeRegion(params.region);
    const file = resolveAvalancheFile(params.region);
    if (!file) return NextResponse.json({ avalanches: [] });

    const raw = fs.readFileSync(file, "utf-8");
    const data = JSON.parse(raw);

    // Expect an array of avalanche records with a "region" field.
    const list: unknown[] = Array.isArray(data)
      ? data
      : Array.isArray((data as any)?.items)
      ? (data as any).items
      : [];

    const filtered = (list as any[]).filter((a) => normalizeRegion(a?.region) === want);

    return NextResponse.json({ avalanches: filtered });
  } catch (e: any) {
    return NextResponse.json(
      { avalanches: [], error: e?.message || "Failed to read avalanches" },
      { status: 500 }
    );
  }
}
