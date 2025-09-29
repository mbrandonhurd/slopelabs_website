export const runtime = "nodejs";
import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";

export async function GET(
  req: Request,
  { params }: { params: { region: string } }
) {
  try {
    const url = new URL(req.url);
    // kind = "model" | "station"
    const kind = url.searchParams.get("kind") || "model";
    const fname = kind === "station" ? "weather_station.csv" : "weather_model.csv";

    const file = path.join(process.cwd(), "public", "data", params.region, fname);
    if (!fs.existsSync(file)) return NextResponse.json({ rows: [] });

    const raw = fs.readFileSync(file, "utf-8");
    const rows = parse(raw, { columns: true, skip_empty_lines: true });
    return NextResponse.json({ rows });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "parse failed" }, { status: 500 });
  }
}
