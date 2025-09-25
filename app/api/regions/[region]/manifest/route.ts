import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export async function GET(_: Request, { params }: { params: { region: string } }) {
  try {
    const filePath = path.join(process.cwd(), "public", "data", params.region, "manifest.json");
    const raw = await fs.readFile(filePath, "utf-8");
    const json = JSON.parse(raw);
    return NextResponse.json(json, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return new NextResponse("Region not found", { status: 404 });
  }
}
