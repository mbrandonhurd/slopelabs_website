export const runtime = "nodejs";
import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

export async function GET(req: Request, { params }: { params: { region: string } }) {
  try {
    const url = new URL(req.url);
    const kind = url.searchParams.get("kind") || "model";  // we use only station here
    if (kind !== "station") return NextResponse.json({ rows: [] });

    const file = path.join(process.cwd(), "public", "data", "shared", "weather_station.csv");
    if (!fs.existsSync(file)) return NextResponse.json({ rows: [] });

    const raw = fs.readFileSync(file, "utf-8");
    const rows = parse(raw, { columns: true, skip_empty_lines: true });
    const region = params.region;
    const filtered = rows.filter((r: any) => String(r.region ?? "").trim() === region);
    return NextResponse.json({ rows: filtered });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "parse failed" }, { status: 500 });
  }
}
