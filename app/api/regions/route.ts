export const runtime = "nodejs";
import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export async function GET() {
  const base = path.join(process.cwd(), "public", "data");
  const items = fs.existsSync(base) ? fs.readdirSync(base, { withFileTypes: true }) : [];
  const regions = items.filter(d => d.isDirectory()).map(d => d.name);
  return NextResponse.json({ regions });
}
