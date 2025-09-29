export const runtime = "nodejs";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const headers: Record<string,string> = {};
  for (const [k, v] of (req.headers as any).entries()) headers[k] = v;
  return NextResponse.json({
    url: url.toString(),
    path: url.pathname,
    headers,
  });
}
