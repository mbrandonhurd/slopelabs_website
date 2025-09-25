import { NextResponse } from "next/server";
export const runtime = "nodejs";
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");
  if (!url) return new NextResponse("Missing url", { status: 400 });
  // TODO: replace with AWS SDK presigner
  return NextResponse.json({ signed: url, expiresIn: 900 });
}
