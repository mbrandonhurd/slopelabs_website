export const runtime = "nodejs";
import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export async function GET(_: Request, { params }: { params: { region: string } }) {
  const file = path.join(process.cwd(), "public", "data", "shared", "avalanches.json");
  if (!fs.existsSync(file)) return NextResponse.json({ avalanches: [] });
  const data = JSON.parse(fs.readFileSync(file, "utf-8"));
  const region = params.region;
  const filtered = Array.isArray(data) ? data.filter((a) => String(a.region ?? "").trim() === region) : [];
  return NextResponse.json({ avalanches: filtered });
}
